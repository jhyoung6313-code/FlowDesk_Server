import { Typography, theme as antTheme } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { useToken } = antTheme;

/* 2-pane 상세(읽기) 패널이 비어 있을 때의 안내 화면 */
export default function DetailEmpty({ icon = <InboxOutlined />, title = '항목을 선택하세요', hint }) {
  const { token } = useToken();
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center',
    }}>
      <div style={{
        width: 88, height: 88, borderRadius: '50%', background: token.colorPrimaryBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 40, color: token.colorPrimary, lineHeight: 0 }}>{icon}</span>
      </div>
      <Text style={{ fontSize: 15, fontWeight: 600, color: token.colorTextSecondary }}>{title}</Text>
      {hint && <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text>}
    </div>
  );
}
