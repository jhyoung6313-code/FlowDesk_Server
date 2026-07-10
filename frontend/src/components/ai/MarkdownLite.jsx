// 마크다운 경량 렌더러(React 요소 기반 — dangerouslySetInnerHTML 미사용, XSS 안전)
// 지원: #~### 제목, - / * 글머리, **굵게**. AI 응답(요약 등) 표시에 사용.
function renderInline(text, keyBase) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>;
    }
    return <span key={`${keyBase}-${i}`}>{p}</span>;
  });
}

export default function MarkdownLite({ text }) {
  const lines = String(text).split('\n');
  const out = [];
  let list = [];
  const flush = (k) => {
    if (list.length) {
      out.push(<ul key={`ul-${k}`} style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{list}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#{1,3}\s/.test(line)) {
      flush(i);
      const level = line.match(/^#+/)[0].length;
      const content = line.replace(/^#+\s/, '');
      const size = level === 1 ? 17 : level === 2 ? 15 : 14;
      out.push(<div key={i} style={{ fontWeight: 700, fontSize: size, margin: '10px 0 4px' }}>{renderInline(content, i)}</div>);
    } else if (/^[-*]\s/.test(line)) {
      list.push(<li key={i} style={{ marginBottom: 2 }}>{renderInline(line.replace(/^[-*]\s/, ''), i)}</li>);
    } else if (line === '') {
      flush(i);
    } else {
      flush(i);
      out.push(<p key={i} style={{ margin: '2px 0' }}>{renderInline(line, i)}</p>);
    }
  });
  flush('end');
  return <div style={{ lineHeight: 1.6 }}>{out}</div>;
}
