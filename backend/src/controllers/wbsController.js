const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');

const DELIVERABLE_DIR = path.join(__dirname, '../../uploads/wbs-deliverables');

// ─── 유틸: 트리 구조로 변환 ───────────────────────────
function buildTree(tasks) {
  const map = {};
  tasks.forEach((t) => {
    map[t.id] = { ...t, children: [] };
  });
  const roots = [];
  tasks.forEach((t) => {
    if (t.parentId) {
      if (map[t.parentId]) map[t.parentId].children.push(map[t.id]);
    } else {
      roots.push(map[t.id]);
    }
  });
  return roots;
}

// ─── 프로젝트 목록 ────────────────────────────────────
exports.getProjects = async (req, res, next) => {
  try {
    const projects = await prisma.wbsProject.findMany({
      include: { members: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
};

// ─── 프로젝트 생성 ────────────────────────────────────
exports.createProject = async (req, res, next) => {
  try {
    const { name, startDate, endDate, description, members } = req.body;
    if (!name) return res.status(400).json({ error: '프로젝트명은 필수입니다.' });

    const project = await prisma.wbsProject.create({
      data: {
        name,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        description: description || null,
        createdBy: req.user.id,
        members: members?.length
          ? {
              create: members.map((m, i) => ({
                role: m.role,
                memberName: m.memberName,
                order: i,
              })),
            }
          : undefined,
      },
      include: { members: { orderBy: { order: 'asc' } } },
    });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
};

// ─── 프로젝트 상세 ────────────────────────────────────
exports.getProject = async (req, res, next) => {
  try {
    const project = await prisma.wbsProject.findUnique({
      where: { id: Number(req.params.id) },
      include: { members: { orderBy: { order: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    res.json(project);
  } catch (err) {
    next(err);
  }
};

// ─── 프로젝트 수정 ────────────────────────────────────
exports.updateProject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, startDate, endDate, description, members } = req.body;

    const project = await prisma.$transaction(async (tx) => {
      const updated = await tx.wbsProject.update({
        where: { id },
        data: {
          name,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          description: description || null,
        },
      });

      if (members !== undefined) {
        await tx.wbsProjectMember.deleteMany({ where: { projectId: id } });
        if (members.length > 0) {
          await tx.wbsProjectMember.createMany({
            data: members.map((m, i) => ({
              projectId: id,
              role: m.role,
              memberName: m.memberName,
              order: i,
            })),
          });
        }
      }

      return tx.wbsProject.findUnique({
        where: { id },
        include: { members: { orderBy: { order: 'asc' } } },
      });
    });

    res.json(project);
  } catch (err) {
    next(err);
  }
};

// ─── 프로젝트 삭제 ────────────────────────────────────
exports.deleteProject = async (req, res, next) => {
  try {
    await prisma.wbsProject.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ─── WBS 항목 목록 (트리) ─────────────────────────────
exports.getTasks = async (req, res, next) => {
  try {
    const tasks = await prisma.wbsTask.findMany({
      where: { projectId: Number(req.params.id) },
      orderBy: [{ level: 'asc' }, { order: 'asc' }],
    });
    res.json(buildTree(tasks));
  } catch (err) {
    next(err);
  }
};

// ─── WBS 항목 생성 ────────────────────────────────────
exports.createTask = async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const { parentId, name, deliverable, startDate, endDate, plannedProgress, actualProgress } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: '작업명은 필수입니다.' });

    const clamp = (v) => Math.min(100, Math.max(0, Number(v) || 0));

    // 같은 부모 하위에서 마지막 order 계산
    const lastTask = await prisma.wbsTask.findFirst({
      where: { projectId, parentId: parentId || null },
      orderBy: { order: 'desc' },
    });
    const order = lastTask ? lastTask.order + 1 : 0;

    // level 계산: parentId 있으면 부모 level+1
    let level = 0;
    if (parentId) {
      const parent = await prisma.wbsTask.findUnique({ where: { id: Number(parentId) } });
      if (parent) level = parent.level + 1;
    }

    const task = await prisma.wbsTask.create({
      data: {
        projectId,
        parentId: parentId ? Number(parentId) : null,
        level,
        order,
        name,
        deliverable: deliverable || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        plannedProgress: clamp(plannedProgress ?? 0),
        actualProgress: clamp(actualProgress ?? 0),
      },
    });
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
};

// ─── WBS 항목 수정 ────────────────────────────────────
exports.updateTask = async (req, res, next) => {
  try {
    const id = Number(req.params.taskId);
    const { name, deliverable, startDate, endDate, plannedProgress, actualProgress, memo } = req.body;

    if (name !== undefined && (!name || !name.trim())) return res.status(400).json({ error: '작업명은 필수입니다.' });

    const clamp = (v) => Math.min(100, Math.max(0, Number(v) || 0));

    const task = await prisma.wbsTask.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(deliverable !== undefined && { deliverable: deliverable || null }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(plannedProgress !== undefined && { plannedProgress: clamp(plannedProgress) }),
        ...(actualProgress !== undefined && { actualProgress: clamp(actualProgress) }),
        ...(memo !== undefined && { memo: memo || null }),
      },
    });
    res.json(task);
  } catch (err) {
    next(err);
  }
};

// ─── 산출물 파일 업로드 ────────────────────────────────
exports.uploadDeliverable = async (req, res, next) => {
  try {
    const id = Number(req.params.taskId);
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    const task = await prisma.wbsTask.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });

    // 기존 파일 삭제
    if (task.deliverableFile) {
      const oldPath = path.join(DELIVERABLE_DIR, task.deliverableFile);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const ext = path.extname(req.file.originalname);
    const storedName = `${crypto.randomUUID()}${ext}`;
    if (!fs.existsSync(DELIVERABLE_DIR)) fs.mkdirSync(DELIVERABLE_DIR, { recursive: true });
    fs.writeFileSync(path.join(DELIVERABLE_DIR, storedName), req.file.buffer);

    const updated = await prisma.wbsTask.update({
      where: { id },
      data: {
        deliverableFile: storedName,
        deliverableOrigName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
      },
    });
    res.json({ deliverableFile: updated.deliverableFile, deliverableOrigName: updated.deliverableOrigName });
  } catch (err) {
    next(err);
  }
};

// ─── 산출물 파일 다운로드 ──────────────────────────────
exports.downloadDeliverable = async (req, res, next) => {
  try {
    const id = Number(req.params.taskId);
    const task = await prisma.wbsTask.findUnique({ where: { id } });
    if (!task || !task.deliverableFile) return res.status(404).json({ error: '파일이 없습니다.' });

    const filePath = path.join(DELIVERABLE_DIR, task.deliverableFile);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    const filename = encodeURIComponent(task.deliverableOrigName || task.deliverableFile);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};

// ─── 산출물 파일 삭제 ──────────────────────────────────
exports.deleteDeliverable = async (req, res, next) => {
  try {
    const id = Number(req.params.taskId);
    const task = await prisma.wbsTask.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });

    if (task.deliverableFile) {
      const filePath = path.join(DELIVERABLE_DIR, task.deliverableFile);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.wbsTask.update({
      where: { id },
      data: { deliverableFile: null, deliverableOrigName: null },
    });
    res.json({ message: '파일이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ─── WBS 항목 삭제 ────────────────────────────────────
exports.deleteTask = async (req, res, next) => {
  try {
    await prisma.wbsTask.delete({ where: { id: Number(req.params.taskId) } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ─── WBS 항목 순서/계층 일괄 변경 ────────────────────
exports.reorderTasks = async (req, res, next) => {
  try {
    const { tasks } = req.body;
    await Promise.all(
      tasks.map((t) =>
        prisma.wbsTask.update({
          where: { id: t.id },
          data: { parentId: t.parentId ?? null, level: t.level, order: t.order },
        })
      )
    );
    res.json({ message: '순서가 변경되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ─── 이슈 목록 ────────────────────────────────────────
exports.getIssues = async (req, res, next) => {
  try {
    const issues = await prisma.wbsIssue.findMany({
      where: { projectId: Number(req.params.id) },
      include: { creator: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(issues);
  } catch (err) {
    next(err);
  }
};

// ─── 이슈 생성 ────────────────────────────────────────
exports.createIssue = async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const { category, content, occurDate, targetDate, progress, expectedDate, status, note } = req.body;
    if (!content) return res.status(400).json({ error: '이슈 내용은 필수입니다.' });

    const issue = await prisma.wbsIssue.create({
      data: {
        projectId,
        category: category || null,
        content,
        occurDate: occurDate ? new Date(occurDate) : null,
        targetDate: targetDate ? new Date(targetDate) : null,
        progress: progress ?? 0,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        status: status || 'open',
        note: note || null,
        createdBy: req.user.id,
      },
      include: { creator: { select: { id: true, displayName: true } } },
    });
    res.status(201).json(issue);
  } catch (err) {
    next(err);
  }
};

// ─── 이슈 수정 ────────────────────────────────────────
exports.updateIssue = async (req, res, next) => {
  try {
    const id = Number(req.params.issueId);
    const { category, content, occurDate, targetDate, progress, expectedDate, status, note } = req.body;

    const issue = await prisma.wbsIssue.update({
      where: { id },
      data: {
        category: category ?? undefined,
        content: content ?? undefined,
        occurDate: occurDate ? new Date(occurDate) : null,
        targetDate: targetDate ? new Date(targetDate) : null,
        progress: progress ?? undefined,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        status: status ?? undefined,
        note: note ?? undefined,
      },
      include: { creator: { select: { id: true, displayName: true } } },
    });
    res.json(issue);
  } catch (err) {
    next(err);
  }
};

// ─── 이슈 삭제 ────────────────────────────────────────
exports.deleteIssue = async (req, res, next) => {
  try {
    await prisma.wbsIssue.delete({ where: { id: Number(req.params.issueId) } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ─── WBS 항목 Excel 내보내기 ─────────────────────────
exports.exportTasksExcel = async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const project = await prisma.wbsProject.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const tasks = await prisma.wbsTask.findMany({
      where: { projectId },
      orderBy: [{ level: 'asc' }, { order: 'asc' }],
    });

    const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const indent = (level) => '  '.repeat(level);

    const rows = tasks.map((t) => ({
      레벨: t.level,
      작업명: indent(t.level) + t.name,
      산출물명: t.deliverable ?? '',
      시작일: fmtDate(t.startDate),
      종료일: fmtDate(t.endDate),
      기간: t.startDate && t.endDate
        ? Math.ceil((new Date(t.endDate) - new Date(t.startDate)) / 86400000) + 1
        : '',
      계획진척률: Number(t.plannedProgress),
      실적진척률: Number(t.actualProgress),
      메모: t.memo ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 36 }, { wch: 20 }, { wch: 12 },
      { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WBS');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = encodeURIComponent(`WBS_${project.name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

// ─── WBS 항목 Excel 업로드 (가져오기) ────────────────
// [지원 형식 A] 표준 WBS 포맷: 헤더 행에 '레벨' | '작업명' | '산출물명' | '시작일' | '종료일' | '계획진척률' | '실적진척률'
// [지원 형식 B] 실무 WBS 포맷: 작업명이 A~G열 계층 위치로 레벨 표현
exports.importTasksExcel = async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });

    const VERSION_RE = /^v\d/i;
    const sheetName =
      wb.SheetNames.find((n) => VERSION_RE.test(n)) ?? wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const serialToDate = (serial) => {
      const utcDays = Math.floor(serial - 25569);
      return new Date(utcDays * 86400 * 1000);
    };

    const parseCellDate = (cell) => {
      if (!cell || cell.v === undefined || cell.v === '') return null;
      if (cell.t === 'd') return cell.v instanceof Date ? cell.v : new Date(cell.v);
      if (cell.t === 'n' && cell.v > 25000) return serialToDate(cell.v);
      if (cell.t === 's') {
        const d = new Date(cell.v);
        return isNaN(d) ? null : d;
      }
      return null;
    };

    const firstRowArr = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: '' })[0] ?? [];
    const isStandardFormat =
      firstRowArr.some((v) => String(v).trim() === '레벨') ||
      firstRowArr.some((v) => String(v).trim() === '작업명');

    let parsedRows = [];

    if (isStandardFormat) {
      const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const parseNum = (val, isDecimal = false) => {
        const n = parseFloat(val);
        if (isNaN(n)) return 0;
        const pct = isDecimal && n <= 1 ? n * 100 : n;
        return Math.min(100, Math.max(0, parseFloat(pct.toFixed(2))));
      };
      const parseDateVal = (val) => {
        if (!val) return null;
        if (val instanceof Date) return val;
        const s = String(val).trim();
        if (!s) return null;
        const d = new Date(s);
        return isNaN(d) ? null : d;
      };

      parsedRows = jsonRows
        .filter((r) => String(r['작업명'] ?? r['Name'] ?? '').trim())
        .map((r) => {
          const levelRaw = parseInt(r['레벨'] ?? r['Level'] ?? 0);
          const plannedRaw = parseFloat(r['계획진척률'] ?? r['Planned'] ?? 0);
          const actualRaw = parseFloat(r['실적진척률'] ?? r['Actual'] ?? 0);
          return {
            level: Math.max(0, Math.min(4, isNaN(levelRaw) ? 0 : levelRaw)),
            name: String(r['작업명'] ?? r['Name']).trim(),
            deliverable: String(r['산출물명'] ?? r['Deliverable'] ?? '').trim() || null,
            startDate: parseDateVal(r['시작일'] ?? r['StartDate']),
            endDate: parseDateVal(r['종료일'] ?? r['EndDate']),
            plannedProgress: parseNum(plannedRaw, plannedRaw <= 1),
            actualProgress: parseNum(actualRaw, actualRaw <= 1),
            memo: String(r['메모'] ?? r['Memo'] ?? '').trim() || null,
          };
        });
    } else {
      const range = XLSX.utils.decode_range(ws['!ref']);

      let dataStartRow = 0;
      for (let r = 0; r <= Math.min(20, range.e.r); r++) {
        const cellA = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        if (cellA && String(cellA.v ?? '').includes('작업명')) {
          dataStartRow = r + 2;
          break;
        }
      }
      if (dataStartRow === 0) {
        for (let r = 0; r <= Math.min(30, range.e.r); r++) {
          for (let c = 0; c <= 6; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && String(cell.v ?? '').trim()) {
              dataStartRow = r;
              break;
            }
          }
          if (dataStartRow > 0) break;
        }
      }

      const COL_DELIVERABLE = 7;
      const COL_START       = 9;
      const COL_END         = 10;
      const COL_PLANNED     = 11;
      const COL_ACTUAL      = 12;
      const LEVEL_COLS      = 7;

      const getCell = (r, c) => ws[XLSX.utils.encode_cell({ r, c })] ?? null;

      for (let r = dataStartRow; r <= range.e.r; r++) {
        let level = -1;
        let name = '';
        for (let c = 0; c < LEVEL_COLS; c++) {
          const cell = getCell(r, c);
          const val = cell ? String(cell.v ?? '').trim() : '';
          if (val) { level = c; name = val; break; }
        }
        if (level === -1 || !name) continue;

        const delivCell   = getCell(r, COL_DELIVERABLE);
        const startCell   = getCell(r, COL_START);
        const endCell     = getCell(r, COL_END);
        const plannedCell = getCell(r, COL_PLANNED);
        const actualCell  = getCell(r, COL_ACTUAL);

        const toProgress = (cell) => {
          if (!cell || cell.v === undefined || cell.v === '') return 0;
          const n = parseFloat(cell.v);
          if (isNaN(n)) return 0;
          const pct = n <= 1 ? n * 100 : n;
          return Math.min(100, Math.max(0, parseFloat(pct.toFixed(2))));
        };

        parsedRows.push({
          level,
          name,
          deliverable: delivCell ? String(delivCell.v ?? '').trim() || null : null,
          startDate:   parseCellDate(startCell),
          endDate:     parseCellDate(endCell),
          plannedProgress: toProgress(plannedCell),
          actualProgress:  toProgress(actualCell),
        });
      }
    }

    if (!parsedRows.length) {
      return res.status(400).json({ error: '가져올 데이터가 없습니다. 파일 형식을 확인해주세요.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.wbsTask.deleteMany({ where: { projectId } });

      const parentStack = [];
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];

        while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= row.level) {
          parentStack.pop();
        }
        const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;

        const created = await tx.wbsTask.create({
          data: {
            projectId,
            parentId,
            level: row.level,
            order: i,
            name: row.name,
            deliverable: row.deliverable,
            startDate: row.startDate,
            endDate: row.endDate,
            plannedProgress: row.plannedProgress,
            actualProgress: row.actualProgress,
            memo: row.memo ?? null,
          },
        });
        parentStack.push({ level: row.level, id: created.id });
      }
    });

    res.json({ message: `${parsedRows.length}개 항목을 가져왔습니다. (시트: ${sheetName})` });
  } catch (err) {
    next(err);
  }
};

// ─── 이슈 Excel 내보내기 ──────────────────────────────
exports.exportIssuesExcel = async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const project = await prisma.wbsProject.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const issues = await prisma.wbsIssue.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    const statusMap = { open: '오픈', in_progress: '진행중', closed: '완료', hold: '보류' };
    const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

    const rows = issues.map((issue, i) => ({
      번호: i + 1,
      구분: issue.category ?? '',
      이슈내용: issue.content,
      발생일: fmtDate(issue.occurDate),
      목표해결일: fmtDate(issue.targetDate),
      '진척률(%)': Number(issue.progress),
      완료예정일: fmtDate(issue.expectedDate),
      상태: statusMap[issue.status] ?? issue.status,
      비고: issue.note ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 40 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '이슈사항');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = encodeURIComponent(`이슈_${project.name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

// ─── 이슈 Excel 업로드 (가져오기) ────────────────────
exports.importIssuesExcel = async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) return res.status(400).json({ error: '데이터가 없습니다.' });

    const statusKoMap = { '오픈': 'open', '진행중': 'in_progress', '완료': 'closed', '보류': 'hold' };
    const validStatuses = new Set(['open', 'in_progress', 'closed', 'hold']);

    const parseDate = (val) => {
      if (!val) return null;
      if (val instanceof Date) return val;
      const s = String(val).trim();
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d) ? null : d;
    };
    const parseNum = (val) => {
      const n = parseFloat(val);
      return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
    };
    const parseStatus = (val) => {
      const s = String(val ?? '').trim();
      if (validStatuses.has(s)) return s;
      return statusKoMap[s] ?? 'open';
    };

    const data = rows
      .filter((r) => String(r['이슈내용'] ?? r['Content'] ?? '').trim())
      .map((r) => ({
        projectId,
        category: String(r['구분'] ?? r['Category'] ?? '').trim() || null,
        content: String(r['이슈내용'] ?? r['Content']).trim(),
        occurDate: parseDate(r['발생일'] ?? r['OccurDate']),
        targetDate: parseDate(r['목표해결일'] ?? r['TargetDate']),
        progress: parseNum(r['진척률(%)'] ?? r['Progress']),
        expectedDate: parseDate(r['완료예정일'] ?? r['ExpectedDate']),
        status: parseStatus(r['상태'] ?? r['Status']),
        note: String(r['비고'] ?? r['Note'] ?? '').trim() || null,
        createdBy: req.user.id,
      }));

    if (!data.length) return res.status(400).json({ error: '유효한 데이터가 없습니다.' });

    await prisma.$transaction(async (tx) => {
      await tx.wbsIssue.deleteMany({ where: { projectId } });
      await tx.wbsIssue.createMany({ data });
    });

    res.json({ message: `${data.length}개 이슈가 가져오기 되었습니다.` });
  } catch (err) {
    next(err);
  }
};

// ─── WBS 항목 업로드용 샘플 양식 다운로드 ─────────────
// importTasksExcel 의 '표준 WBS 포맷' 헤더와 동일한 컬럼으로 예시 행을 채운 빈 양식을 생성한다.
exports.downloadTasksTemplate = async (req, res, next) => {
  try {
    const sample = [
      { 레벨: 0, 작업명: '1. 기획 단계', 산출물명: '', 시작일: '2026-01-02', 종료일: '2026-01-10', 계획진척률: 100, 실적진척률: 100, 메모: '대분류(레벨 0)' },
      { 레벨: 1, 작업명: '  요구사항 정의', 산출물명: '요구사항정의서.docx', 시작일: '2026-01-02', 종료일: '2026-01-05', 계획진척률: 100, 실적진척률: 80, 메모: '중분류(레벨 1)' },
      { 레벨: 2, 작업명: '    인터뷰 진행', 산출물명: '인터뷰록.xlsx', 시작일: '2026-01-02', 종료일: '2026-01-03', 계획진척률: 100, 실적진척률: 100, 메모: '소분류(레벨 2)' },
      { 레벨: 0, 작업명: '2. 개발 단계', 산출물명: '', 시작일: '2026-01-11', 종료일: '2026-02-28', 계획진척률: 50, 실적진척률: 20, 메모: '' },
    ];

    const guide = [
      ['■ WBS 업로드 양식 작성 안내'],
      [''],
      ['1. "WBS" 시트의 헤더(레벨/작업명/산출물명/시작일/종료일/계획진척률/실적진척률/메모) 행은 수정하지 마세요.'],
      ['2. 레벨: 0=대분류, 1=중분류, 2=소분류 … (0~4). 작업명 앞 공백 들여쓰기는 선택사항이며 레벨 값이 우선합니다.'],
      ['3. 시작일/종료일: YYYY-MM-DD 형식 (예: 2026-01-02). 비워두면 미지정으로 처리됩니다.'],
      ['4. 계획진척률/실적진척률: 0~100 사이 숫자(%). 0~1 사이 소수로 입력하면 백분율로 환산됩니다.'],
      ['5. 산출물명/메모: 선택 입력 항목입니다.'],
      ['6. 업로드 시 해당 프로젝트의 기존 WBS 항목은 모두 삭제 후 새로 등록됩니다(덮어쓰기).'],
      ['7. 예시 행은 삭제하고 실제 데이터를 입력하세요.'],
    ];

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [
      { wch: 6 }, { wch: 36 }, { wch: 20 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'WBS');

    const wsGuide = XLSX.utils.aoa_to_sheet(guide);
    wsGuide['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, '작성안내');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = encodeURIComponent('WBS_업로드_양식.xlsx');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

// ─── 이슈사항 업로드용 샘플 양식 다운로드 ─────────────
// importIssuesExcel 의 헤더와 동일한 컬럼으로 예시 행을 채운 빈 양식을 생성한다.
exports.downloadIssuesTemplate = async (req, res, next) => {
  try {
    const sample = [
      { 구분: '기술', 이슈내용: '로그인 시 간헐적 세션 만료 발생', 발생일: '2026-01-05', 목표해결일: '2026-01-10', '진척률(%)': 30, 완료예정일: '2026-01-12', 상태: '진행중', 비고: '재현 환경 확인 필요' },
      { 구분: '일정', 이슈내용: '외부 API 연동 지연으로 일정 영향', 발생일: '2026-01-06', 목표해결일: '2026-01-15', '진척률(%)': 0, 완료예정일: '', 상태: '오픈', 비고: '' },
    ];

    const guide = [
      ['■ 이슈사항 업로드 양식 작성 안내'],
      [''],
      ['1. "이슈사항" 시트의 헤더(구분/이슈내용/발생일/목표해결일/진척률(%)/완료예정일/상태/비고) 행은 수정하지 마세요.'],
      ['2. 이슈내용은 필수 입력 항목입니다. (비어 있는 행은 무시됩니다)'],
      ['3. 날짜(발생일/목표해결일/완료예정일): YYYY-MM-DD 형식. 비워두면 미지정으로 처리됩니다.'],
      ['4. 진척률(%): 0~100 사이 숫자.'],
      ['5. 상태: 오픈 / 진행중 / 완료 / 보류 중 하나로 입력하세요. (영문 open/in_progress/closed/hold 도 가능)'],
      ['6. 구분/비고: 선택 입력 항목입니다.'],
      ['7. 업로드 시 해당 프로젝트의 기존 이슈는 모두 삭제 후 새로 등록됩니다(덮어쓰기).'],
      ['8. 예시 행은 삭제하고 실제 데이터를 입력하세요.'],
    ];

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [
      { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 12 },
      { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, '이슈사항');

    const wsGuide = XLSX.utils.aoa_to_sheet(guide);
    wsGuide['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, '작성안내');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = encodeURIComponent('이슈사항_업로드_양식.xlsx');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
};
