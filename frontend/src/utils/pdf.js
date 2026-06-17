import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import { getEffectiveStatus } from './dday';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function createDoc(orientation = 'landscape') {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  try {
    const res = await fetch('/fonts/NanumGothic.ttf');
    const buffer = await res.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    doc.addFileToVFS('NanumGothic.ttf', base64);
    doc.addFont('NanumGothic.ttf', 'NanumGothic', 'normal');
    doc.addFont('NanumGothic.ttf', 'NanumGothic', 'bold');
    doc.setFont('NanumGothic');
  } catch (e) {
    console.warn('NanumGothic 폰트 로드 실패 - 한글이 깨질 수 있습니다.', e);
  }
  return doc;
}

const STATUS_LABEL = {
  pending: '대기',
  in_progress: '진행중',
  done: '완료',
  hold: '보류',
  overdue: '지연',
};

const PRIORITY_LABEL = {
  high: '높음',
  normal: '보통',
  low: '낮음',
};

/**
 * 업무 목록을 PDF로 출력합니다.
 * @param {Array} tasks
 * @param {string} filename
 */
export async function exportTasksPdf(tasks, filename) {
  const doc = await createDoc('landscape');
  const now = dayjs().format('YYYY-MM-DD');

  doc.setFontSize(16);
  doc.text('Flowdesk - \uc5c5\ubb34 \ubaa9\ub85d', 14, 16);
  doc.setFontSize(10);
  doc.text(`\ucd9c\ub825\uc77c: ${now}  /  \uc804\uccb4 ${tasks.length}\uac74`, 14, 23);

  autoTable(doc, {
    startY: 28,
    head: [['#', '\uc5c5\ubb34\uba85', '\ud30c\ud2b8', '\ub2f4\ub2f9\uc790', '\uc6b0\uc120\uc21c\uc704', '\uc0c1\ud0dc', '\uc2dc\uc791\uc77c', '\ub9c8\uac10\uc77c']],
    body: tasks.map((t, i) => [
      i + 1,
      t.title,
      t.part?.name || '-',
      [
        ...(t.assignees?.map((a) => a.user?.displayName) || []),
        ...(t.extraAssignees?.map((e) => e.name) || []),
      ].join(', ') || '-',
      PRIORITY_LABEL[t.priority] || t.priority,
      STATUS_LABEL[getEffectiveStatus(t.status, t.dueDate)] || t.status,
      t.startDate ? dayjs(t.startDate).format('YYYY-MM-DD') : '-',
      t.dueDate ? dayjs(t.dueDate).format('YYYY-MM-DD') : '-',
    ]),
    styles: { fontSize: 9, cellPadding: 3, font: 'NanumGothic' },
    headStyles: { fillColor: [22, 119, 255], textColor: 255, fontStyle: 'bold', font: 'NanumGothic' },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 60 },
      2: { cellWidth: 25 },
      3: { cellWidth: 35 },
      4: { cellWidth: 18 },
      5: { cellWidth: 18 },
      6: { cellWidth: 26 },
      7: { cellWidth: 26 },
    },
  });

  const pdfFilename = filename || `\uc5c5\ubb34\ubaa9\ub85d_${now}.pdf`;
  doc.save(pdfFilename);
}

/**
 * WBS 항목을 PDF로 출력합니다.
 * @param {string} projectName
 * @param {Array} tasks
 */
export async function exportWbsPdf(projectName, tasks) {
  const doc = await createDoc('landscape');
  const now = dayjs().format('YYYY-MM-DD');

  doc.setFontSize(16);
  doc.text(`Flowdesk - WBS: ${projectName}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`\ucd9c\ub825\uc77c: ${now}`, 14, 23);

  const flatRows = [];
  const flatten = (nodes, depth = 0) => {
    for (const n of nodes) {
      const indent = '\u00a0'.repeat(depth * 4);
      const duration =
        n.startDate && n.endDate
          ? dayjs(n.endDate).diff(dayjs(n.startDate), 'day') + 1
          : '-';
      flatRows.push([
        `${indent}${n.name}`,
        n.deliverable || '-',
        n.startDate ? dayjs(n.startDate).format('MM-DD') : '-',
        n.endDate ? dayjs(n.endDate).format('MM-DD') : '-',
        typeof duration === 'number' ? `${duration}\uc77c` : '-',
        n.plannedProgress != null ? `${Number(n.plannedProgress)}%` : '-',
        n.actualProgress != null ? `${Number(n.actualProgress)}%` : '-',
        n.memo || '-',
      ]);
      if (n.children?.length) flatten(n.children, depth + 1);
    }
  };
  flatten(tasks);

  autoTable(doc, {
    startY: 28,
    head: [['\uc791\uc5c5\uba85', '\uc0b0\ucd9c\ubb3c', '\uc2dc\uc791', '\uc885\ub8cc', '\uae30\uac04', '\uacc4\ud68d\uc9c4\ucca0', '\uc2e4\uc801\uc9c4\ucca0', '\uba54\ubaa8']],
    body: flatRows,
    styles: { fontSize: 9, cellPadding: 3, font: 'NanumGothic' },
    headStyles: { fillColor: [82, 196, 26], textColor: 255, fontStyle: 'bold', font: 'NanumGothic' },
    alternateRowStyles: { fillColor: [246, 255, 237] },
    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 35 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 14 },
      5: { cellWidth: 18 },
      6: { cellWidth: 18 },
      7: { cellWidth: 48 },
    },
  });

  doc.save(`WBS_${projectName}_${now}.pdf`);
}

/**
 * 이슈 목록을 PDF로 출력합니다.
 * @param {string} projectName
 * @param {Array} issues
 */
export async function exportIssuesPdf(projectName, issues) {
  const doc = await createDoc('landscape');
  const now = dayjs().format('YYYY-MM-DD');

  doc.setFontSize(16);
  doc.text(`Flowdesk - \uc774\uc288\uc0ac\ud56d: ${projectName}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`\ucd9c\ub825\uc77c: ${now}  /  \uc804\uccb4 ${issues.length}\uac74`, 14, 23);

  const ISSUE_STATUS = { open: '\uc624\ud508', in_progress: '\uc9c4\ud589\uc911', closed: '\uc644\ub8cc', hold: '\ubcf4\ub958' };

  autoTable(doc, {
    startY: 28,
    head: [['#', '\uad6c\ubd84', '\uc774\uc288\ub0b4\uc6a9', '\ubc1c\uc0dd\uc77c', '\ubaa9\ud45c\ud574\uacb0\uc77c', '\uc9c4\ucca8\ub960', '\uc644\ub8cc\uc608\uc815\uc77c', '\uc0c1\ud0dc', '\ube44\uace0']],
    body: issues.map((iss, i) => [
      i + 1,
      iss.category || '-',
      iss.content,
      iss.occurDate ? dayjs(iss.occurDate).format('MM-DD') : '-',
      iss.targetDate ? dayjs(iss.targetDate).format('MM-DD') : '-',
      `${Number(iss.progress)}%`,
      iss.expectedDate ? dayjs(iss.expectedDate).format('MM-DD') : '-',
      ISSUE_STATUS[iss.status] || iss.status,
      iss.note || '-',
    ]),
    styles: { fontSize: 9, cellPadding: 3, font: 'NanumGothic' },
    headStyles: { fillColor: [250, 140, 22], textColor: 255, fontStyle: 'bold', font: 'NanumGothic' },
    alternateRowStyles: { fillColor: [255, 247, 230] },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 22 },
      2: { cellWidth: 60 },
      3: { cellWidth: 20 },
      4: { cellWidth: 22 },
      5: { cellWidth: 16 },
      6: { cellWidth: 22 },
      7: { cellWidth: 18 },
      8: { cellWidth: 30 },
    },
  });

  doc.save(`\uc774\uc288_${projectName}_${now}.pdf`);
}

const SEVERITY_LABEL = {
  p1: 'P1 긴급', p2: 'P2 높음', p3: 'P3 보통', none: '-',
};

const RUN_STATUS_LABEL = {
  active: '진행 중', paused: '일시정지', finished: '완료', archived: '보관됨',
};

const STEP_STATUS_LABEL = {
  pending: '대기', in_progress: '진행 중', done: '완료',
  skipped: '건너뜀', blocked: '차단됨', rejected: '거절됨',
};

const PARTICIPANT_ROLE_LABEL = {
  owner: 'Owner', coordinator: '코디네이터', participant: '참여자',
};

/**
 * Playbook Run 보고서를 PDF로 출력합니다.
 * @param {object} run
 */
export async function exportRunReportPdf(run) {
  const doc = await createDoc('portrait');
  const margin = 14;
  let y = 20;

  doc.setFontSize(18);
  doc.text(`Run Report: ${run.name}`, margin, y);
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Playbook: ${run.playbook?.name || 'Ad-hoc'}`, margin, y); y += 6;
  doc.text(`상태: ${RUN_STATUS_LABEL[run.status] || run.status}   심각도: ${SEVERITY_LABEL[run.severity] || '-'}`, margin, y); y += 6;
  doc.text(`Owner: ${run.owner?.displayName || '-'}   시작: ${dayjs(run.startedAt).format('YYYY-MM-DD HH:mm')}`, margin, y); y += 6;
  if (run.endedAt) { doc.text(`완료: ${dayjs(run.endedAt).format('YYYY-MM-DD HH:mm')}`, margin, y); y += 6; }
  doc.setTextColor(0);
  y += 4;

  const totalSteps = run.steps?.length || 0;
  const doneSteps = run.steps?.filter((s) => ['done', 'skipped', 'rejected'].includes(s.status)).length || 0;
  const pctVal = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;
  doc.setFontSize(11);
  doc.text(`진행률: ${doneSteps}/${totalSteps} (${pctVal}%)`, margin, y);
  y += 10;

  doc.setFontSize(12);
  doc.text('단계 목록', margin, y);
  y += 4;

  const stepRows = (run.steps || []).map((s) => [
    s.title,
    STEP_STATUS_LABEL[s.status] || s.status,
    s.assignee?.displayName || '-',
    s.completedAt ? dayjs(s.completedAt).format('MM/DD HH:mm') : '-',
    s.evidence || '-',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['단계 이름', '상태', '담당자', '완료 시각', '증거/결과']],
    body: stepRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2, font: 'NanumGothic' },
    headStyles: { fillColor: [22, 119, 255], textColor: 255, font: 'NanumGothic' },
  });

  y = doc.lastAutoTable.finalY + 10;

  if (run.summary) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text('요약', margin, y); y += 6;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(run.summary, 180);
    doc.text(lines, margin, y); y += lines.length * 5 + 6;
  }

  if (run.participants?.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text('참여자', margin, y); y += 6;
    doc.setFontSize(10);
    run.participants.forEach((p) => {
      doc.text(`• ${p.user?.displayName || '-'} (${PARTICIPANT_ROLE_LABEL[p.role] || p.role})`, margin + 2, y);
      y += 5;
    });
  }

  doc.save(`run-report-${run.id}-${dayjs().format('YYYYMMDD')}.pdf`);
}

/**
 * WBS 주간 보고서 PDF (표지 + 진척 요약 + WBS 항목 + 이슈 목록)
 * @param {object} project
 * @param {Array} tasks
 * @param {Array} issues
 * @param {string|null} refDate
 */
export async function exportWbsReportPdf(project, tasks, issues = [], refDate = null) {
  const doc = await createDoc('portrait');
  const now = dayjs().format('YYYY-MM-DD');
  const baseDate = refDate ? dayjs(refDate) : dayjs();
  const W = 210;

  const flattenTree = (nodes) => {
    const result = [];
    const walk = (arr) => arr.forEach((n) => { result.push(n); if (n.children?.length) walk(n.children); });
    walk(nodes || []);
    return result;
  };
  const allTasks = flattenTree(tasks);

  const overallPlanned = tasks.length
    ? Math.round(tasks.reduce((s, t) => s + (Number(t.plannedProgress) || 0), 0) / tasks.length) : 0;
  const overallActual = tasks.length
    ? Math.round(tasks.reduce((s, t) => s + (Number(t.actualProgress) || 0), 0) / tasks.length) : 0;
  const compliance = overallPlanned > 0
    ? Math.min(Math.round((overallActual / overallPlanned) * 100), 100) : 0;
  const delayedCount = allTasks.filter((t) => {
    if (!t.endDate) return false;
    return (Number(t.actualProgress) || 0) < 100 && baseDate.startOf('day').isAfter(dayjs(t.endDate).startOf('day'));
  }).length;

  const ISSUE_STATUS = { open: '오픈', in_progress: '진행중', closed: '완료', hold: '보류' };

  // ── PAGE 1: 표지 ──────────────────────────────────────
  doc.setFillColor(27, 94, 32);
  doc.rect(0, 0, W, 55, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text('WBS 프로젝트 진첨 보고서', 14, 14);
  doc.setFontSize(22);
  doc.text(project.name || '프로젝트', 14, 28);
  doc.setFontSize(10);
  const period = [
    project.startDate ? dayjs(project.startDate).format('YYYY.MM.DD') : '',
    project.endDate ? dayjs(project.endDate).format('YYYY.MM.DD') : '',
  ].filter(Boolean).join(' ~ ');
  if (period) doc.text(`프로젝트 기간: ${period}`, 14, 38);
  doc.text(`보고 기준일: ${baseDate.format('YYYY.MM.DD')}  /  출력일: ${now}`, 14, 46);

  if (project.members?.length) {
    let mx = 14;
    doc.setFontSize(9);
    project.members.forEach((m) => {
      const label = `${m.role}: ${m.memberName}`;
      const tw = doc.getTextWidth(label) + 6;
      doc.setFillColor(232, 245, 233);
      doc.setDrawColor(129, 199, 132);
      doc.roundedRect(mx, 60, tw, 8, 1, 1, 'FD');
      doc.setTextColor(27, 94, 32);
      doc.text(label, mx + 3, 65.5);
      mx += tw + 4;
    });
  }

  // 진척 요약 박스 4개
  const boxY = 82;
  const boxW = (W - 28 - 9) / 4;
  const boxes = [
    { label: '계획 진첨률', value: `${overallPlanned}%`, color: [24, 144, 255] },
    { label: '실적 진첨률', value: `${overallActual}%`, color: overallActual >= overallPlanned ? [82, 196, 26] : [255, 122, 69] },
    { label: '공정 준수율', value: `${compliance}%`, color: compliance >= 100 ? [82, 196, 26] : compliance >= 80 ? [250, 173, 20] : [255, 77, 79] },
    { label: '지연 항목', value: `${delayedCount}건`, color: delayedCount > 0 ? [255, 77, 79] : [82, 196, 26] },
  ];
  boxes.forEach((box, i) => {
    const bx = 14 + i * (boxW + 3);
    doc.setFillColor(248, 254, 248);
    doc.setDrawColor(...box.color);
    doc.setLineWidth(0.5);
    doc.roundedRect(bx, boxY, boxW, 28, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(box.label, bx + boxW / 2, boxY + 8, { align: 'center' });
    doc.setFontSize(18);
    doc.setTextColor(...box.color);
    doc.text(box.value, bx + boxW / 2, boxY + 21, { align: 'center' });
  });

  if (issues.length > 0) {
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(11);
    doc.text('이슈 현황', 14, 122);
    doc.setFillColor(27, 94, 32);
    doc.rect(14, 124, 30, 0.5, 'F');
    autoTable(doc, {
      startY: 128,
      head: [['#', '구분(WBS)', '이슈내용', '목표해결일', '상태']],
      body: issues.slice(0, 8).map((iss, i) => [
        i + 1,
        iss.category || '-',
        iss.content?.length > 40 ? iss.content.slice(0, 40) + '...' : iss.content,
        iss.targetDate ? dayjs(iss.targetDate).format('MM/DD') : '-',
        ISSUE_STATUS[iss.status] || iss.status,
      ]),
      styles: { fontSize: 8, cellPadding: 2, font: 'NanumGothic' },
      headStyles: { fillColor: [250, 140, 22], textColor: 255, font: 'NanumGothic', fontSize: 8 },
      alternateRowStyles: { fillColor: [255, 251, 240] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 35 }, 2: { cellWidth: 90 }, 3: { cellWidth: 22 }, 4: { cellWidth: 18 } },
    });
    if (issues.length > 8) {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`※ 외 ${issues.length - 8}건 추가 이슈 있음`, 14, doc.lastAutoTable.finalY + 5);
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text('1 / 2', W - 14, 290, { align: 'right' });

  // ── PAGE 2: WBS 항목 상세 ─────────────────────────────
  doc.addPage();
  doc.setFillColor(27, 94, 32);
  doc.rect(0, 0, W, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`WBS 항목 상세  |  ${project.name}  |  기준일: ${baseDate.format('YYYY.MM.DD')}`, 14, 9);

  const flatRows = [];
  const buildRows = (nodes, depth = 0) => {
    nodes.forEach((n) => {
      const indent = ' '.repeat(depth * 3);
      const planned = Number(n.plannedProgress) || 0;
      const actual = Number(n.actualProgress) || 0;
      const comp = planned > 0 ? Math.min(Math.round((actual / planned) * 100), 100) : null;
      const delayed = n.endDate && actual < 100 && baseDate.startOf('day').isAfter(dayjs(n.endDate).startOf('day'));
      flatRows.push([
        `${indent}${n.name}`,
        n.deliverable || '-',
        n.startDate ? dayjs(n.startDate).format('MM/DD') : '-',
        n.endDate ? dayjs(n.endDate).format('MM/DD') : '-',
        `${planned}%`,
        `${actual}%`,
        comp !== null ? `${comp}%` : '-',
        delayed ? `D+${baseDate.startOf('day').diff(dayjs(n.endDate).startOf('day'), 'day')}일` : '',
      ]);
      if (n.children?.length) buildRows(n.children, depth + 1);
    });
  };
  buildRows(tasks);

  autoTable(doc, {
    startY: 18,
    head: [['작업명', '산출물', '시작', '종료', '계획', '실적', '준수율', '지연']],
    body: flatRows,
    styles: { fontSize: 8, cellPadding: 2.5, font: 'NanumGothic', overflow: 'ellipsize' },
    headStyles: { fillColor: [46, 125, 50], textColor: 255, font: 'NanumGothic', fontSize: 8 },
    alternateRowStyles: { fillColor: [243, 250, 243] },
    columnStyles: {
      0: { cellWidth: 65 }, 1: { cellWidth: 32 }, 2: { cellWidth: 16 },
      3: { cellWidth: 16 }, 4: { cellWidth: 14 }, 5: { cellWidth: 14 },
      6: { cellWidth: 16 }, 7: { cellWidth: 14 },
    },
    didParseCell: (data) => {
      if (data.column.index === 7 && data.cell.text[0]?.startsWith('D+')) {
        data.cell.styles.textColor = [255, 77, 79];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && data.column.index === 5 && flatRows[data.row.index]) {
        const p = parseFloat(flatRows[data.row.index][4]);
        const a = parseFloat(flatRows[data.row.index][5]);
        if (!isNaN(p) && !isNaN(a) && a < p) data.cell.styles.textColor = [255, 122, 69];
      }
    },
  });

  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text('2 / 2', W - 14, 290, { align: 'right' });

  doc.save(`WBS_보고서_${project.name}_${now}.pdf`);
}
