import { Avatar, Checkbox, Typography, theme as antTheme } from 'antd';
import { avatarColor, initial } from '../../utils/listkit';

const { Text } = Typography;
const { useToken } = antTheme;

/* ══════════════════════════════════════════════════════════════
   AvatarListRow — M365 2-pane 스타일의 아바타 2줄 목록 행
   메일·채팅 등 "사람 + 제목 + 미리보기" 형태 목록에 재사용.

   props
   ・name            line1 좌측 이름(+ 아바타 색/이니셜 소스)
   ・time            line1 우측 시간
   ・subject         line2 본문 제목
   ・subjectPrefix   line2 제목 앞 요소(예: 긴급 태그)
   ・subjectSuffix   line2 제목 뒤 요소(예: 첨부 아이콘)
   ・preview         line3 미리보기 텍스트
   ・labelDots       line3 우측 색 점 배열([color, ...])
   ・unread          안읽음 강조(파란 점 + 굵게)
   ・active          현재 선택(열람 중) 하이라이트
   ・selectable      선택 체크박스 사용(호버 시 아바타↔체크박스 전환)
   ・selected        체크 상태
   ・onSelectToggle  체크 토글
   ・actions         우측 호버 액션(별표/삭제 등)
   ・onClick         행 클릭
   ══════════════════════════════════════════════════════════════ */
export default function AvatarListRow({
  name = '-', time, subject, subjectPrefix, subjectSuffix, preview,
  labelDots = [], unread = false, active = false,
  selectable = false, selected = false, onSelectToggle,
  actions, onClick,
}) {
  const { token } = useToken();
  return (
    <div
      onClick={onClick}
      className="lk-row"
      style={{
        display: 'flex', gap: 10, padding: '11px 14px', cursor: 'pointer',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: active ? token.colorPrimaryBg : 'transparent',
        boxShadow: active ? `inset 3px 0 0 ${token.colorPrimary}` : 'none',
        position: 'relative', transition: 'background 0.12s',
      }}
    >
      {/* 아바타 / 선택 체크박스 */}
      {selectable ? (
        <div className={`lk-row-selcell${selected ? ' checked' : ''}`} style={{ position: 'relative', flexShrink: 0, width: 34, height: 34 }} onClick={e => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onSelectToggle} className="lk-row-check" />
          <Avatar size={34} className="lk-row-avatar" style={{ background: avatarColor(name), fontWeight: 700, fontSize: 13 }}>{initial(name)}</Avatar>
        </div>
      ) : (
        <Avatar size={34} style={{ background: avatarColor(name), fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initial(name)}</Avatar>
      )}

      {/* 본문 3줄 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: token.colorPrimary, flexShrink: 0 }} />}
          <Text style={{ fontSize: 13, fontWeight: unread ? 800 : 500, flex: 1, minWidth: 0 }} ellipsis>{name}</Text>
          {time && <Text style={{ fontSize: 12, color: token.colorTextQuaternary, fontWeight: 600, flexShrink: 0 }}>{time}</Text>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '2px 0' }}>
          {subjectPrefix}
          <Text style={{ fontSize: 12.5, fontWeight: unread ? 700 : 400, color: token.colorText, flex: 1, minWidth: 0 }} ellipsis={{ tooltip: typeof subject === 'string' ? subject : undefined }}>
            {subject}
          </Text>
          {subjectSuffix}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12, color: token.colorTextTertiary, flex: 1, minWidth: 0 }} ellipsis>{preview}</Text>
          {labelDots.map((c, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />)}
        </div>
      </div>

      {/* 호버 액션 */}
      {actions && (
        <div className="lk-row-actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
