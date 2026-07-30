import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row, Col, Card, Statistic, Typography, List, Tag, Space, Spin, Empty,
} from 'antd';
import {
  TeamOutlined, CheckCircleOutlined, CrownOutlined, LockOutlined, SafetyOutlined,
  LoginOutlined, UserOutlined, ApartmentOutlined, ReloadOutlined, TagsOutlined,
  FlagOutlined, FileTextOutlined, FileDoneOutlined, MailOutlined, HistoryOutlined,
  SafetyCertificateOutlined, DatabaseOutlined, SettingOutlined, RightOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAdminSummary, getSystemSettings } from '../../api/admin';

// 감사로그 액션 → 라벨/색상
const ACTION_META = {
  LOGIN_FAIL:        { label: '로그인 실패',   color: 'warning' },
  ACCOUNT_LOCKED:    { label: '계정 잠금',     color: 'error' },
  PERMISSION_DENIED: { label: '권한 거부',     color: 'error' },
  ANOMALY_DETECTED:  { label: '이상 징후',     color: 'magenta' },
  PASSWORD_RESET:    { label: '비밀번호 초기화', color: 'blue' },
};

// 관리자 기능 카드 정의 (기능별 그룹)
const FUNCTION_GROUPS = [
  {
    title: '사용자 · 조직',
    items: [
      { path: '/admin/users', icon: <UserOutlined />, label: '사용자 관리', desc: '계정 생성·권한·잠금 해제' },
      { path: '/admin/departments', icon: <ApartmentOutlined />, label: '부서 · 팀 관리', desc: '조직 구조 관리' },
    ],
  },
  {
    title: '기준정보',
    items: [
      { path: '/admin/recurring-tasks', icon: <ReloadOutlined />, label: '반복업무 관리', desc: '반복 업무 스케줄' },
      { path: '/admin/tags', icon: <TagsOutlined />, label: '태그 관리', desc: '업무 분류 태그' },
      { path: '/admin/milestones', icon: <FlagOutlined />, label: '마일스톤 관리', desc: '프로젝트 이정표' },
      { path: '/admin/templates', icon: <FileTextOutlined />, label: '업무 템플릿 관리', desc: '반복 양식 템플릿' },
      { path: '/admin/approval', icon: <FileDoneOutlined />, label: '결재 양식 관리', desc: '전자결재 양식' },
      { path: '/admin/automations', icon: <ThunderboltOutlined />, label: '자동화 규칙', desc: '이벤트 기반 워크플로 자동화' },
    ],
  },
  {
    title: '시스템 · 보안',
    items: [
      { path: '/admin/system', icon: <SettingOutlined />, label: '시스템 설정', desc: '일반 설정·보안 정책' },
      { path: '/admin/email-settings', icon: <MailOutlined />, label: '이메일 알림 설정', desc: 'SMTP·알림 발송' },
      { path: '/admin/activity-log', icon: <HistoryOutlined />, label: '활동 로그', desc: '업무 변경 이력' },
      { path: '/admin/audit-log', icon: <SafetyCertificateOutlined />, label: '접속기록', desc: '보안 감사로그' },
      { path: '/admin/backup', icon: <DatabaseOutlined />, label: '백업 / 복원', desc: '데이터 백업' },
    ],
  },
];

function StatCard({ icon, title, value, color, suffix, onClick }) {
  return (
    <Card
      size="small"
      hoverable={!!onClick}
      onClick={onClick}
      style={{ borderRadius: 12 }}
      styles={{ body: { padding: '16px 18px' } }}
    >
      <Space align="start" size={12}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color, background: `${color}18`,
          }}
        >
          {icon}
        </div>
        <Statistic title={title} value={value} suffix={suffix} valueStyle={{ fontSize: 22, fontWeight: 700 }} />
      </Space>
    </Card>
  );
}

export default function AdminConsole() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [appName, setAppName] = useState('FlowDesk');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAdminSummary(), getSystemSettings()])
      .then(([s, sys]) => {
        setSummary(s);
        setAppName(sys?.general?.app_name || 'FlowDesk');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const u = summary?.users || {};

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            <SettingOutlined style={{ marginRight: 8 }} />
            관리자 콘솔
          </Typography.Title>
          <Typography.Text type="secondary">{appName} 운영 · 보안 관리</Typography.Text>
        </div>
      </Row>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : (
        <>
          {/* ── 통계 카드 ── */}
          <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8} md={4}>
              <StatCard icon={<TeamOutlined />} title="전체 사용자" value={u.total ?? 0} color="#2563eb" onClick={() => navigate('/admin/users')} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatCard icon={<CheckCircleOutlined />} title="활성 계정" value={u.active ?? 0} color="#16a34a" onClick={() => navigate('/admin/users')} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatCard icon={<CrownOutlined />} title="관리자" value={u.admin ?? 0} color="#d97706" onClick={() => navigate('/admin/users')} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatCard icon={<LockOutlined />} title="잠긴 계정" value={u.locked ?? 0} color={u.locked > 0 ? '#dc2626' : '#94a3b8'} onClick={() => navigate('/admin/users')} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatCard icon={<SafetyOutlined />} title="OTP 사용" value={u.otp ?? 0} color="#7c3aed" onClick={() => navigate('/admin/users')} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <StatCard icon={<LoginOutlined />} title="오늘 로그인" value={summary?.todayLogins ?? 0} color="#0891b2" onClick={() => navigate('/admin/audit-log')} />
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            {/* ── 관리자 기능 카드 ── */}
            <Col xs={24} lg={16}>
              {FUNCTION_GROUPS.map((grp) => (
                <div key={grp.title} style={{ marginBottom: 20 }}>
                  <Typography.Text
                    strong
                    style={{ fontSize: 13, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' }}
                  >
                    {grp.title}
                  </Typography.Text>
                  <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
                    {grp.items.map((it) => (
                      <Col xs={24} sm={12} key={it.path}>
                        <Card
                          size="small"
                          hoverable
                          onClick={() => navigate(it.path)}
                          style={{ borderRadius: 12 }}
                          styles={{ body: { padding: '12px 14px' } }}
                        >
                          <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Space align="center" size={12}>
                              <span style={{ fontSize: 18, color: '#2563eb' }}>{it.icon}</span>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{it.label}</div>
                                <Typography.Text type="secondary" style={{ fontSize: 13 }}>{it.desc}</Typography.Text>
                              </div>
                            </Space>
                            <RightOutlined style={{ color: '#cbd5e1', fontSize: 13 }} />
                          </Space>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </div>
              ))}
            </Col>

            {/* ── 최근 보안 이벤트 ── */}
            <Col xs={24} lg={8}>
              <Card
                title={<Space><SafetyCertificateOutlined />최근 보안 이벤트</Space>}
                size="small"
                style={{ borderRadius: 12 }}
                extra={<a onClick={() => navigate('/admin/audit-log')}>전체 보기</a>}
              >
                {summary?.recentSecurity?.length ? (
                  <List
                    size="small"
                    dataSource={summary.recentSecurity}
                    renderItem={(log) => {
                      const meta = ACTION_META[log.action] || { label: log.action, color: 'default' };
                      return (
                        <List.Item>
                          <List.Item.Meta
                            title={
                              <Space size={6}>
                                <Tag color={meta.color} style={{ margin: 0 }}>{meta.label}</Tag>
                                <Typography.Text style={{ fontSize: 13 }}>
                                  {log.user?.displayName || log.user?.username || log.username || '알 수 없음'}
                                </Typography.Text>
                              </Space>
                            }
                            description={
                              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                                {dayjs(log.createdAt).format('MM/DD HH:mm')}
                                {log.ipAddress ? ` · ${log.ipAddress}` : ''}
                              </Typography.Text>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                ) : (
                  <Empty description="최근 보안 이벤트 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
