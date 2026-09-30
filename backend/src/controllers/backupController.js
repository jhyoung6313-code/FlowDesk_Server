const crypto = require('crypto');

const prisma = require('../lib/prisma');
const MAGIC = Buffer.from('FLW1');

// v1.10: 나머지 신규 도메인(보드/위키/회의/OKR/자동화/폼/플레이북 일부/가계부/일정) —
// 선언적 테이블 목록 + 범용 upsert로 처리한다(48개 모델을 각각 손으로 작성하면 중복이
// 지나치게 커진다 — backupController 자체의 "반복 patterns" 지적을 그대로 반영).
// 순서 = FK 의존순(부모 먼저). pk 생략 시 ['id']. self:true는 자기참조 트리(재시도 upsert).
// 의도적으로 뺀 것: PlaybookVersion/PlaybookWebhook/PlaybookSchedule/RunUpdate/RunTimeline/
// RunStepChecklist — 버전이력·웹훅설정·활동로그 성격이라 우선순위가 낮아 이번 라운드에는 제외.
const EXTRA_TABLES = [
  // 보드(Board)
  { key: 'boardCategories', model: 'boardCategory', dates: ['createdAt', 'updatedAt'], self: true },
  { key: 'boards', model: 'board', dates: ['createdAt', 'updatedAt'] },
  { key: 'boardViews', model: 'boardView', dates: ['createdAt', 'updatedAt'] },
  { key: 'boardMembers', model: 'boardMember', pk: ['boardId', 'userId'], dates: ['lastReadAt'] },
  { key: 'boardProperties', model: 'boardProperty', dates: [] },
  { key: 'boardCards', model: 'boardCard', dates: ['startDate', 'dueDate', 'createdAt', 'updatedAt'] },
  { key: 'boardPropertyValues', model: 'boardPropertyValue', pk: ['cardId', 'propertyId'], dates: [] },
  { key: 'boardCardAssignees', model: 'boardCardAssignee', pk: ['cardId', 'userId', 'type'], dates: [] },
  { key: 'boardCardLinks', model: 'boardCardLink', dates: ['createdAt'] },
  { key: 'boardCardComments', model: 'boardCardComment', dates: ['createdAt', 'updatedAt'] },
  { key: 'boardCardAttachments', model: 'boardCardAttachment', dates: ['createdAt'] },
  { key: 'boardCardChecklists', model: 'boardCardChecklist', dates: ['createdAt'] },
  { key: 'boardCardDependencies', model: 'boardCardDependency', pk: ['dependentId', 'blockingId'], dates: ['createdAt'] },
  { key: 'boardAutomations', model: 'boardAutomation', dates: ['createdAt', 'updatedAt'] },
  // 위키(Wiki)
  { key: 'wikiSpaces', model: 'wikiSpace', dates: ['createdAt'] },
  { key: 'wikiDocs', model: 'wikiDoc', dates: ['createdAt', 'updatedAt'], self: true },
  { key: 'wikiDocVersions', model: 'wikiDocVersion', dates: ['createdAt'] },
  { key: 'wikiDocComments', model: 'wikiDocComment', dates: ['createdAt'] },
  // 회의(Meeting)
  { key: 'meetings', model: 'meeting', dates: ['startAt', 'endAt', 'createdAt', 'updatedAt'] },
  { key: 'meetingAgenda', model: 'meetingAgenda', dates: [] },
  { key: 'meetingAttendees', model: 'meetingAttendee', dates: [] },
  { key: 'meetingDecisions', model: 'meetingDecision', dates: ['createdAt'] },
  { key: 'meetingActionItems', model: 'meetingActionItem', dates: ['dueDate', 'createdAt'] },
  // OKR
  { key: 'okrCycles', model: 'okrCycle', dates: ['startDate', 'endDate', 'createdAt'] },
  { key: 'objectives', model: 'objective', dates: ['createdAt'], self: true },
  { key: 'keyResults', model: 'keyResult', dates: ['createdAt'] },
  { key: 'keyResultLinks', model: 'keyResultLink', dates: [] },
  { key: 'keyResultCheckins', model: 'keyResultCheckin', dates: ['createdAt'] },
  // 자동화(Automation)
  { key: 'automationRules', model: 'automationRule', dates: ['lastRunAt', 'createdAt', 'updatedAt'] },
  { key: 'automationLogs', model: 'automationLog', dates: ['createdAt'] },
  // Forms
  { key: 'forms', model: 'form', dates: ['createdAt', 'updatedAt'] },
  { key: 'formFields', model: 'formField', dates: [] },
  { key: 'formResponses', model: 'formResponse', dates: ['createdAt'] },
  { key: 'formAnswers', model: 'formAnswer', dates: [] },
  // 가계부(Ledger)
  { key: 'ledgerCategories', model: 'ledgerCategory', dates: ['createdAt'] },
  { key: 'ledgerRecurrings', model: 'ledgerRecurring', dates: ['createdAt', 'updatedAt'] },
  { key: 'ledgerEntries', model: 'ledgerEntry', dates: ['date', 'createdAt', 'updatedAt'] },
  { key: 'ledgerBudgets', model: 'ledgerBudget', pk: ['categoryId', 'year', 'month'], dates: ['createdAt', 'updatedAt'] },
  // 일정/자원(Schedule)
  { key: 'scheduleResources', model: 'scheduleResource', dates: ['createdAt', 'updatedAt'] },
  { key: 'scheduleEvents', model: 'scheduleEvent', dates: ['startDate', 'endDate', 'createdAt', 'updatedAt'] },
  { key: 'scheduleEventAssignees', model: 'scheduleEventAssignee', pk: ['eventId', 'userId'], dates: [] },
  { key: 'scheduleEventShares', model: 'scheduleEventShare', pk: ['eventId', 'userId'], dates: [] },
  { key: 'scheduleEventShareScopes', model: 'scheduleEventShareScope', pk: ['eventId', 'kind', 'refId'], dates: [] },
  { key: 'holidays', model: 'holiday', dates: ['date', 'createdAt', 'updatedAt'] },
  // 플레이북(Playbook) — 핵심 정의·실행 상태만(위 주석의 제외 목록 참조)
  { key: 'playbooks', model: 'playbook', dates: ['createdAt', 'updatedAt'] },
  { key: 'playbookPhases', model: 'playbookPhase', dates: [] },
  { key: 'playbookSteps', model: 'playbookStep', dates: ['dueAt'] },
  { key: 'playbookRuns', model: 'playbookRun', dates: ['dueAt', 'startedAt', 'endedAt', 'createdAt', 'updatedAt'] },
  { key: 'runSteps', model: 'runStep', dates: ['dueAt', 'startedAt', 'completedAt', 'createdAt', 'updatedAt'] },
  { key: 'runParticipants', model: 'runParticipant', dates: ['joinedAt'] },
];

function deriveKey() {
  return crypto.scryptSync(process.env.JWT_SECRET, 'flowdesk-backup-salt-v1', 32);
}

function encryptBackup(jsonStr) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

function decryptBackup(buf) {
  if (!buf.subarray(0, 4).equals(MAGIC)) throw Object.assign(new Error('올바른 백업 파일이 아닙니다.'), { status: 400 });
  const key = deriveKey();
  const iv = buf.subarray(4, 16);
  const tag = buf.subarray(16, 32);
  const ciphertext = buf.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const backup = async (req, res, next) => {
  try {
    const [
      users, departments, teams, tasks, taskAssignees, taskExtraAssignees, taskDependencies,
      taskComments, taskAttachments, taskHistories, taskTags,
      tags, milestones, notifications, recurringTasks, taskTemplates,
      calendarNotes, wbsProjects, wbsProjectMembers, wbsTasks, wbsIssues,
      timeEntries, appSettings,
      // v1.9: 전자결재/게시판/사내메일/채팅 (우선순위 상위 4개 신규 도메인 — 나머지 도메인은 후속 반영)
      bbsCategories, bbsPosts, bbsComments, bbsAttachments,
      approvalFormTypes, approvalTemplates, approvalDocuments, approvalDocSeq,
      approvalSteps, approvalAttachments, approvalComments,
      internalMails, internalMailLabels, internalMailLabelLinks,
      internalMailComments, internalMailRecipients, internalMailAttachments,
      chatRooms, chatRoomMembers, chatMessages, chatMessageReactions,
    ] = await Promise.all([
      prisma.user.findMany({ select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, totpEnabled: true, departmentId: true, teamId: true } }),
      prisma.department.findMany(),
      prisma.team.findMany(),
      prisma.task.findMany(),
      prisma.taskAssignee.findMany(),
      prisma.taskExtraAssignee.findMany(),
      prisma.taskDependency.findMany(),
      prisma.taskComment.findMany(),
      prisma.taskAttachment.findMany(),
      prisma.taskHistory.findMany(),
      prisma.taskTag.findMany(),
      prisma.tag.findMany(),
      prisma.milestone.findMany(),
      prisma.notification.findMany(),
      prisma.recurringTask.findMany(),
      prisma.taskTemplate.findMany(),
      prisma.calendarNote.findMany(),
      prisma.wbsProject.findMany(),
      prisma.wbsProjectMember.findMany(),
      prisma.wbsTask.findMany(),
      prisma.wbsIssue.findMany(),
      prisma.timeEntry.findMany(),
      prisma.appSetting.findMany(),
      prisma.bbsCategory.findMany(),
      prisma.bbsPost.findMany(),
      prisma.bbsComment.findMany(),
      prisma.bbsAttachment.findMany(),
      prisma.approvalFormType.findMany(),
      prisma.approvalTemplate.findMany(),
      prisma.approvalDocument.findMany(),
      prisma.approvalDocSeq.findMany(),
      prisma.approvalStep.findMany(),
      prisma.approvalAttachment.findMany(),
      prisma.approvalComment.findMany(),
      prisma.internalMail.findMany(),
      prisma.internalMailLabel.findMany(),
      prisma.internalMailLabelLink.findMany(),
      prisma.internalMailComment.findMany(),
      prisma.internalMailRecipient.findMany(),
      prisma.internalMailAttachment.findMany(),
      prisma.chatRoom.findMany(),
      prisma.chatRoomMember.findMany(),
      prisma.chatMessage.findMany(),
      prisma.chatMessageReaction.findMany(),
    ]);

    const backupData = {
      version: '1.10',
      exportedAt: new Date().toISOString(),
      data: {
        users, departments, teams, tasks, taskAssignees, taskExtraAssignees, taskDependencies,
        taskComments, taskAttachments, taskHistories, taskTags,
        tags, milestones, notifications, recurringTasks, taskTemplates,
        calendarNotes, wbsProjects, wbsProjectMembers, wbsTasks, wbsIssues,
        timeEntries, appSettings,
        bbsCategories, bbsPosts, bbsComments, bbsAttachments,
        approvalFormTypes, approvalTemplates, approvalDocuments, approvalDocSeq,
        approvalSteps, approvalAttachments, approvalComments,
        internalMails, internalMailLabels, internalMailLabelLinks,
        internalMailComments, internalMailRecipients, internalMailAttachments,
        chatRooms, chatRoomMembers, chatMessages, chatMessageReactions,
      },
    };

    // 나머지 신규 도메인(EXTRA_TABLES) — 선언 순서대로 병렬 조회 후 합류
    const extraResults = await Promise.all(EXTRA_TABLES.map((t) => prisma[t.model].findMany()));
    EXTRA_TABLES.forEach((t, i) => { backupData.data[t.key] = extraResults[i]; });

    const encrypted = encryptBackup(JSON.stringify(backupData));
    const filename = `flowdesk_backup_${new Date().toISOString().slice(0, 10)}.enc`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(encrypted);
  } catch (err) {
    next(err);
  }
};

const restore = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '백업 파일이 없습니다.' });

    let parsed;
    try {
      const jsonStr = decryptBackup(req.file.buffer);
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(400).json({ error: '백업 파일을 복호화할 수 없습니다. 올바른 파일인지 확인하세요.' });
    }

    const { data } = parsed;
    if (!data) return res.status(400).json({ error: '백업 데이터가 없습니다.' });

    // 트랜잭션으로 복원 (기존 데이터 유지하고 누락된 데이터만 추가 — additive upsert)
    // 날짜 헬퍼: 백업은 날짜를 ISO 문자열로 저장하므로 Date로 되돌린다.
    const D = (v) => (v ? new Date(v) : null);
    // 자기참조(트리/스레드) 테이블용: 부모가 아직 생성되지 않아 FK 에러가 나면 다음 패스에서 재시도한다
    // (부모-자식 순서를 미리 계산하지 않고도 임의 깊이의 트리를 안전하게 복원하기 위함).
    // 5패스를 다 돌고도 실패한 행은 droppedRows에 기록해 응답에서 사용자에게 알린다 — 예전엔
    // 조용히 버려지고도 "복원이 완료되었습니다"만 떴다.
    const droppedRows = [];
    const upsertTree = async (items, upsertOne, label) => {
      let remaining = [...items];
      for (let pass = 0; pass < 5 && remaining.length; pass++) {
        const failed = [];
        for (const item of remaining) {
          try { await upsertOne(item); } catch { failed.push(item); }
        }
        if (failed.length === remaining.length) break;
        remaining = failed;
      }
      if (remaining.length) droppedRows.push({ table: label, count: remaining.length });
    };
    // 소규모 팀(2~10명) 로컬 백업이라도 데이터가 누적되면 EXTRA_TABLES의 순차 upsert가 Prisma
    // 인터랙티브 트랜잭션 기본 타임아웃(5초)을 넘겨 복원 전체가 중간에 실패할 수 있다. 근본 해결은
    // 순차 upsert를 createMany 배치로 바꾸는 것(후속 과제로 CODE_REVIEW에 기록)이지만, 그 전까지는
    // 타임아웃을 넉넉히 늘려 "느리지만 끝까지 완료"되도록 방어한다.
    await prisma.$transaction(async (tx) => {
      // departments (팀보다 먼저 복원)
      for (const dept of (data.departments || [])) {
        await tx.department.upsert({
          where: { id: dept.id },
          update: { name: dept.name, description: dept.description, order: dept.order ?? 0 },
          create: dept,
        });
      }

      // teams
      for (const team of (data.teams || [])) {
        await tx.team.upsert({
          where: { id: team.id },
          update: { name: team.name, departmentId: team.departmentId, description: team.description, order: team.order ?? 0 },
          create: team,
        });
      }

      // tags
      for (const tag of (data.tags || [])) {
        await tx.tag.upsert({
          where: { id: tag.id },
          update: { name: tag.name, color: tag.color },
          create: tag,
        });
      }

      // milestones
      for (const m of (data.milestones || [])) {
        await tx.milestone.upsert({
          where: { id: m.id },
          update: { name: m.name, date: new Date(m.date), color: m.color, description: m.description },
          create: { ...m, date: new Date(m.date), createdAt: new Date(m.createdAt), updatedAt: new Date(m.updatedAt) },
        });
      }

      // recurringTasks (독립: 팀/사용자만 참조)
      for (const r of (data.recurringTasks || [])) {
        await tx.recurringTask.upsert({
          where: { id: r.id },
          update: {},
          create: { ...r, recurrenceEnd: D(r.recurrenceEnd), createdAt: D(r.createdAt), updatedAt: D(r.updatedAt) },
        });
      }

      // taskTemplates (독립)
      for (const t of (data.taskTemplates || [])) {
        await tx.taskTemplate.upsert({
          where: { id: t.id },
          update: {},
          create: { ...t, createdAt: D(t.createdAt), updatedAt: D(t.updatedAt) },
        });
      }

      // tasks
      for (const task of (data.tasks || [])) {
        await tx.task.upsert({
          where: { id: task.id },
          update: {
            title: task.title, description: task.description, partId: task.partId,
            priority: task.priority, status: task.status,
            startDate: task.startDate ? new Date(task.startDate) : null,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            delYn: task.delYn,
          },
          create: {
            ...task,
            startDate: task.startDate ? new Date(task.startDate) : null,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt),
          },
        });
      }

      // taskAssignees
      for (const ta of (data.taskAssignees || [])) {
        await tx.taskAssignee.upsert({
          where: { taskId_userId: { taskId: ta.taskId, userId: ta.userId } },
          update: {},
          create: { ...ta, assignedAt: new Date(ta.assignedAt) },
        });
      }

      // taskDependencies
      for (const dep of (data.taskDependencies || [])) {
        await tx.taskDependency.upsert({
          where: { predecessorId_successorId: { predecessorId: dep.predecessorId, successorId: dep.successorId } },
          update: {},
          create: dep,
        });
      }

      // taskExtraAssignees (task 이후)
      for (const ea of (data.taskExtraAssignees || [])) {
        await tx.taskExtraAssignee.upsert({ where: { id: ea.id }, update: {}, create: ea });
      }

      // taskTags (task + tag 이후, 복합키)
      for (const tt of (data.taskTags || [])) {
        await tx.taskTag.upsert({
          where: { taskId_tagId: { taskId: tt.taskId, tagId: tt.tagId } },
          update: {},
          create: { taskId: tt.taskId, tagId: tt.tagId },
        });
      }

      // taskComments (task + user 이후)
      for (const c of (data.taskComments || [])) {
        await tx.taskComment.upsert({
          where: { id: c.id },
          update: {},
          create: { ...c, createdAt: D(c.createdAt), updatedAt: D(c.updatedAt) },
        });
      }

      // taskAttachments (commentId가 taskComment를 참조하므로 댓글 이후)
      for (const a of (data.taskAttachments || [])) {
        await tx.taskAttachment.upsert({
          where: { id: a.id },
          update: {},
          create: { ...a, createdAt: D(a.createdAt) },
        });
      }

      // taskHistories (task + user 이후)
      for (const h of (data.taskHistories || [])) {
        await tx.taskHistory.upsert({
          where: { id: h.id },
          update: {},
          create: { ...h, createdAt: D(h.createdAt) },
        });
      }

      // timeEntries (task + user 이후)
      for (const te of (data.timeEntries || [])) {
        await tx.timeEntry.upsert({
          where: { id: te.id },
          update: {},
          create: { ...te, startTime: D(te.startTime), endTime: D(te.endTime), createdAt: D(te.createdAt) },
        });
      }

      // calendarNotes
      for (const note of (data.calendarNotes || [])) {
        await tx.calendarNote.upsert({
          where: { id: note.id },
          update: { content: note.content, date: new Date(note.date) },
          create: { ...note, date: new Date(note.date), createdAt: new Date(note.createdAt), updatedAt: new Date(note.updatedAt) },
        });
      }

      // wbsProjects
      for (const proj of (data.wbsProjects || [])) {
        await tx.wbsProject.upsert({
          where: { id: proj.id },
          update: { name: proj.name, description: proj.description },
          create: {
            ...proj,
            startDate: proj.startDate ? new Date(proj.startDate) : null,
            endDate: proj.endDate ? new Date(proj.endDate) : null,
            createdAt: new Date(proj.createdAt),
            updatedAt: new Date(proj.updatedAt),
          },
        });
      }

      // wbsProjectMembers (project 이후)
      for (const pm of (data.wbsProjectMembers || [])) {
        await tx.wbsProjectMember.upsert({ where: { id: pm.id }, update: {}, create: pm });
      }

      // wbsTasks (project 이후 + 자기참조 parentId → level 오름차순으로 부모 먼저 생성)
      const wbsTasksSorted = [...(data.wbsTasks || [])].sort((a, b) => (a.level || 0) - (b.level || 0));
      for (const w of wbsTasksSorted) {
        await tx.wbsTask.upsert({
          where: { id: w.id },
          update: {},
          create: { ...w, startDate: D(w.startDate), endDate: D(w.endDate), createdAt: D(w.createdAt), updatedAt: D(w.updatedAt) },
        });
      }

      // wbsIssues (project + user 이후)
      for (const wi of (data.wbsIssues || [])) {
        await tx.wbsIssue.upsert({
          where: { id: wi.id },
          update: {},
          create: { ...wi, occurDate: D(wi.occurDate), targetDate: D(wi.targetDate), expectedDate: D(wi.expectedDate), createdAt: D(wi.createdAt), updatedAt: D(wi.updatedAt) },
        });
      }

      // ── 게시판(BBS) ──────────────────────────────────────────
      // bbsCategories (자기참조 트리)
      await upsertTree((data.bbsCategories || []), (c) =>
        tx.bbsCategory.upsert({
          where: { id: c.id }, update: {},
          create: { ...c, createdAt: D(c.createdAt), updatedAt: D(c.updatedAt) },
        }), 'bbsCategories');

      // bbsPosts (category 이후)
      for (const p of (data.bbsPosts || [])) {
        await tx.bbsPost.upsert({
          where: { id: p.id }, update: {},
          create: { ...p, officialDueDate: D(p.officialDueDate), createdAt: D(p.createdAt), updatedAt: D(p.updatedAt) },
        });
      }

      // bbsComments (post 이후, 자기참조 답글)
      await upsertTree((data.bbsComments || []), (c) =>
        tx.bbsComment.upsert({
          where: { id: c.id }, update: {},
          create: { ...c, createdAt: D(c.createdAt), updatedAt: D(c.updatedAt) },
        }), 'bbsComments');

      // bbsAttachments (post/comment 이후)
      for (const a of (data.bbsAttachments || [])) {
        await tx.bbsAttachment.upsert({ where: { id: a.id }, update: {}, create: { ...a, createdAt: D(a.createdAt) } });
      }

      // ── 전자결재(Approval) ────────────────────────────────────
      // approvalFormTypes (자기참조 트리)
      await upsertTree((data.approvalFormTypes || []), (f) =>
        tx.approvalFormType.upsert({
          where: { id: f.id }, update: {},
          create: { ...f, createdAt: D(f.createdAt), updatedAt: D(f.updatedAt) },
        }), 'approvalFormTypes');

      // approvalTemplates (formType 이후)
      for (const t of (data.approvalTemplates || [])) {
        await tx.approvalTemplate.upsert({
          where: { id: t.id }, update: {},
          create: { ...t, createdAt: D(t.createdAt), updatedAt: D(t.updatedAt) },
        });
      }

      // approvalDocuments (template 이후)
      for (const d of (data.approvalDocuments || [])) {
        await tx.approvalDocument.upsert({
          where: { id: d.id }, update: {},
          create: { ...d, dueDate: D(d.dueDate), createdAt: D(d.createdAt), updatedAt: D(d.updatedAt) },
        });
      }

      // approvalDocSeq (독립, 복합키)
      for (const s of (data.approvalDocSeq || [])) {
        await tx.approvalDocSeq.upsert({
          where: { formCode_year: { formCode: s.formCode, year: s.year } },
          update: {}, create: s,
        });
      }

      // approvalSteps (document 이후)
      for (const s of (data.approvalSteps || [])) {
        await tx.approvalStep.upsert({
          where: { id: s.id }, update: {},
          create: { ...s, actionAt: D(s.actionAt), createdAt: D(s.createdAt) },
        });
      }

      // approvalAttachments (document 이후)
      for (const a of (data.approvalAttachments || [])) {
        await tx.approvalAttachment.upsert({ where: { id: a.id }, update: {}, create: { ...a, createdAt: D(a.createdAt) } });
      }

      // approvalComments (document 이후)
      for (const c of (data.approvalComments || [])) {
        await tx.approvalComment.upsert({
          where: { id: c.id }, update: {},
          create: { ...c, createdAt: D(c.createdAt), updatedAt: D(c.updatedAt) },
        });
      }

      // ── 사내메일(Mail) ────────────────────────────────────────
      // internalMails (parentId/threadId/forwardedFrom이 서로를 참조 → 재시도)
      await upsertTree((data.internalMails || []), (m) =>
        tx.internalMail.upsert({
          where: { id: m.id }, update: {},
          create: { ...m, createdAt: D(m.createdAt), updatedAt: D(m.updatedAt) },
        }), 'internalMails');

      // internalMailLabels (user 이후)
      for (const l of (data.internalMailLabels || [])) {
        await tx.internalMailLabel.upsert({ where: { id: l.id }, update: {}, create: { ...l, createdAt: D(l.createdAt) } });
      }

      // internalMailLabelLinks (label + mail 이후, 복합키)
      for (const ll of (data.internalMailLabelLinks || [])) {
        await tx.internalMailLabelLink.upsert({
          where: { labelId_mailId: { labelId: ll.labelId, mailId: ll.mailId } },
          update: {}, create: ll,
        });
      }

      // internalMailComments (mail 이후)
      for (const c of (data.internalMailComments || [])) {
        await tx.internalMailComment.upsert({
          where: { id: c.id }, update: {},
          create: { ...c, createdAt: D(c.createdAt), updatedAt: D(c.updatedAt) },
        });
      }

      // internalMailRecipients (mail 이후, 복합키)
      for (const r of (data.internalMailRecipients || [])) {
        await tx.internalMailRecipient.upsert({
          where: { mailId_userId: { mailId: r.mailId, userId: r.userId } },
          update: {}, create: { ...r, readAt: D(r.readAt), deletedAt: D(r.deletedAt) },
        });
      }

      // internalMailAttachments (mail 이후)
      for (const a of (data.internalMailAttachments || [])) {
        await tx.internalMailAttachment.upsert({ where: { id: a.id }, update: {}, create: { ...a, createdAt: D(a.createdAt) } });
      }

      // ── 채팅(Chat) ───────────────────────────────────────────
      // chatRooms
      for (const r of (data.chatRooms || [])) {
        await tx.chatRoom.upsert({
          where: { id: r.id }, update: {},
          create: { ...r, createdAt: D(r.createdAt), updatedAt: D(r.updatedAt) },
        });
      }

      // chatRoomMembers (room 이후, 복합키)
      for (const m of (data.chatRoomMembers || [])) {
        await tx.chatRoomMember.upsert({
          where: { roomId_userId: { roomId: m.roomId, userId: m.userId } },
          update: {}, create: { ...m, joinedAt: D(m.joinedAt), lastReadAt: D(m.lastReadAt), lastUnreadAt: D(m.lastUnreadAt) },
        });
      }

      // chatMessages (room 이후, parentId/forwardedFromId 자기참조 → 재시도)
      await upsertTree((data.chatMessages || []), (m) =>
        tx.chatMessage.upsert({
          where: { id: m.id }, update: {},
          create: { ...m, editedAt: D(m.editedAt), createdAt: D(m.createdAt) },
        }), 'chatMessages');

      // chatMessageReactions (message 이후)
      for (const r of (data.chatMessageReactions || [])) {
        await tx.chatMessageReaction.upsert({ where: { id: r.id }, update: {}, create: { ...r, createdAt: D(r.createdAt) } });
      }

      // ── 나머지 신규 도메인(EXTRA_TABLES, 선언 순서 = FK 의존순) ────────────
      for (const table of EXTRA_TABLES) {
        const rows = data[table.key] || [];
        const doUpsert = (row) => {
          const create = { ...row };
          for (const df of table.dates) create[df] = D(row[df]);
          const pk = table.pk || ['id'];
          const where = pk.length === 1
            ? { [pk[0]]: row[pk[0]] }
            : { [pk.join('_')]: Object.fromEntries(pk.map((k) => [k, row[k]])) };
          return tx[table.model].upsert({ where, update: {}, create });
        };
        if (table.self) await upsertTree(rows, doUpsert, table.key);
        else { for (const row of rows) await doUpsert(row); }
      }

      // appSettings
      for (const setting of (data.appSettings || [])) {
        await tx.appSetting.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: setting,
        });
      }
    }, { timeout: 120000 });

    res.json({
      message: '복원이 완료되었습니다.',
      ...(droppedRows.length ? { warning: '일부 행을 복원하지 못했습니다(참조 무결성 오류 등).', dropped: droppedRows } : {}),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { backup, restore };
