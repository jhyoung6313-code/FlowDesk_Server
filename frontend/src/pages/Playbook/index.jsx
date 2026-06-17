import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Tag, Space, Modal, Popconfirm, Empty,
  Typography, Row, Col, Input, Select, Tooltip, Badge, Divider, message,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  BookOutlined, CopyOutlined, SearchOutlined, ClockCircleOutlined,
  UnorderedListOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import * as pbApi from '../../api/playbook';
import useAuthStore from '../../store/authStore';

const { Title, Text } = Typography;
const { Search } = Input;

const CATEGORY_MAP = {
  general:     { label: '범용',       color: 'default' },
  incident:    { label: '인시던트',   color: 'red'     },
  release:     { label: '배포/릴리즈', color: 'blue'    },
  onboarding:  { label: '온보딩',     color: 'green'   },
  offboarding: { label: '오프보딩',   color: 'orange'  },
  review:      { label: '정기점검',   color: 'purple'  },
  maintenance: { label: '유지보수',   color: 'cyan'    },
  emergency:   { label: '긴급대응',   color: 'volcano' },
};

export default function PlaybookListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await pbApi.getPlaybooks(categoryFilter ? { category: categoryFilter } : {});
      setPlaybooks(data);
    } catch {
      message.error('불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [categoryFilter]);

  const handleDelete = async (id) => {
    try {
      await pbApi.deletePlaybook(id);
      message.success('삭제되었습니다.');
      load();
    } catch {
      message.error('삭제 실패');
    }
  };

  const handleClone = async (id) => {
    try {
      const cloned = await pbApi.clonePlaybook(id);
      message.success('복제되었습니다.');
      navigate(`/playbooks/${cloned.id}/edit`);
    } catch {
      message.error('복제 실패');
    }
  };

  const filtered = playbooks.filter((pb) =>
    !search || pb.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <BookOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Playbook
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/playbooks/new')}>
          새 Playbook
        </Button>
      </div>

      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Search
          placeholder="Playbook 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          placeholder="카테고리"
          value={categoryFilter}
          onChange={setCategoryFilter}
          allowClear
          style={{ width: 140 }}
        >
          {Object.entries(CATEGORY_MAP).map(([k, v]) => (
            <Select.Option key={k} value={k}>{v.label}</Select.Option>
          ))}
        </Select>
      </div>

      {/* 카드 목록 */}
      {filtered.length === 0 && !loading ? (
        <Empty description="Playbook이 없습니다. 새로 만들어보세요!" />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((pb) => {
            const cat = CATEGORY_MAP[pb.category] || { label: pb.category, color: 'default' };
            const stepCount = pb._count?.steps ?? pb.steps?.length ?? 0;
            const phaseCount = pb.phases?.length ?? 0;
            const tags = Array.isArray(pb.tags) ? pb.tags : [];
            const canEdit = isAdmin || pb.createdBy === user?.id;

            return (
              <Col xs={24} sm={12} lg={8} key={pb.id}>
                <Card
                  hoverable
                  style={{ height: '100%', cursor: 'pointer' }}
                  onClick={() => navigate(`/playbooks/${pb.id}`)}
                  actions={[
                    <Tooltip title="Run 시작" key="run">
                      <PlayCircleOutlined
                        style={{ color: '#52c41a', fontSize: 16 }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/runs?playbookId=${pb.id}`); }}
                      />
                    </Tooltip>,
                    <Tooltip title="편집" key="edit">
                      <EditOutlined
                        onClick={(e) => { e.stopPropagation(); navigate(`/playbooks/${pb.id}/edit`); }}
                      />
                    </Tooltip>,
                    <Tooltip title="복제" key="clone">
                      <CopyOutlined
                        onClick={(e) => { e.stopPropagation(); handleClone(pb.id); }}
                      />
                    </Tooltip>,
                    ...(canEdit ? [
                      <Popconfirm
                        key="del"
                        title="삭제하시겠습니까?"
                        onConfirm={(e) => { e?.stopPropagation?.(); handleDelete(pb.id); }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DeleteOutlined style={{ color: '#ff4d4f' }} />
                      </Popconfirm>,
                    ] : []),
                  ]}
                >
                  {/* 카테고리 + 버전 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Tag color={cat.color}>{cat.label}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>v{pb.version}</Text>
                  </div>

                  {/* 이름 */}
                  <Title level={5} style={{ margin: '0 0 4px', fontSize: 14 }}>{pb.name}</Title>

                  {/* 설명 */}
                  {pb.description && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                      {pb.description.length > 60 ? `${pb.description.slice(0, 60)}...` : pb.description}
                    </Text>
                  )}

                  {/* 태그 */}
                  {tags.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {tags.slice(0, 3).map((t) => (
                        <Tag key={t} style={{ fontSize: 11, marginBottom: 2 }}>{t}</Tag>
                      ))}
                    </div>
                  )}

                  <Divider style={{ margin: '8px 0' }} />

                  {/* 통계 */}
                  <Space size={12} style={{ fontSize: 11 }}>
                    <Tooltip title="페이즈">
                      <Space size={4}>
                        <AppstoreOutlined style={{ color: '#888' }} />
                        <Text type="secondary">{phaseCount}개 페이즈</Text>
                      </Space>
                    </Tooltip>
                    <Tooltip title="스텝">
                      <Space size={4}>
                        <UnorderedListOutlined style={{ color: '#888' }} />
                        <Text type="secondary">{stepCount}개 단계</Text>
                      </Space>
                    </Tooltip>
                    <Tooltip title="총 실행 횟수">
                      <Space size={4}>
                        <PlayCircleOutlined style={{ color: '#888' }} />
                        <Text type="secondary">{pb._count?.runs ?? 0}회</Text>
                      </Space>
                    </Tooltip>
                  </Space>

                  <div style={{ marginTop: 6 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>by {pb.creator?.displayName}</Text>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
}
