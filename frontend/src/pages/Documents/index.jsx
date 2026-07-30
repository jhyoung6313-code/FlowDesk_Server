import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Input, Segmented, Tag, Typography, Space, message, Tooltip, Avatar } from 'antd';
import {
  FileOutlined, FilePdfOutlined, FileImageOutlined, FileExcelOutlined, FileWordOutlined,
  FileZipOutlined, FileTextOutlined, LinkOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getDocuments } from '../../api/documents';
import { avatarColor, initial } from '../../utils/listkit';

const SOURCE = {
  task: { label: '업무', color: 'blue' }, board: { label: '보드', color: 'cyan' },
  bbs: { label: '게시판', color: 'gold' }, approval: { label: '결재', color: 'orange' }, mail: { label: '메일', color: 'purple' },
};

function fileIcon(mime = '') {
  if (mime.includes('pdf')) return <FilePdfOutlined style={{ color: '#f5222d' }} />;
  if (mime.startsWith('image/')) return <FileImageOutlined style={{ color: '#52c41a' }} />;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return <FileExcelOutlined style={{ color: '#237804' }} />;
  if (mime.includes('word') || mime.includes('document')) return <FileWordOutlined style={{ color: '#1677ff' }} />;
  if (mime.includes('zip') || mime.includes('compressed')) return <FileZipOutlined style={{ color: '#fa8c16' }} />;
  if (mime.startsWith('text/')) return <FileTextOutlined style={{ color: '#8c8c8c' }} />;
  return <FileOutlined style={{ color: '#8c8c8c' }} />;
}

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(0)} KB` : `${n} B`);

export default function DocumentsPage() {
  const [data, setData] = useState({ items: [], counts: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const navigate = useNavigate();

  const load = useCallback((query, src) => {
    setLoading(true);
    getDocuments({ ...(query ? { q: query } : {}), ...(src ? { source: src } : {}) })
      .then(setData)
      .catch(() => message.error('문서 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load('', ''); }, [load]);

  // 검색 디바운스
  useEffect(() => {
    const t = setTimeout(() => load(q, source), 300);
    return () => clearTimeout(t);
  }, [q, source, load]);

  const columns = [
    {
      title: '파일', dataIndex: 'fileName', key: 'fileName',
      render: (v, r) => <Space>{fileIcon(r.mimeType)}<span>{v}</span></Space>,
    },
    { title: '출처', dataIndex: 'source', key: 'source', width: 90, render: (v) => <Tag color={SOURCE[v]?.color}>{SOURCE[v]?.label || v}</Tag> },
    {
      title: '위치', dataIndex: 'contextTitle', key: 'contextTitle',
      render: (v, r) => (
        <Tooltip title="원본 위치로 이동">
          <a onClick={() => navigate(r.contextPath)}><LinkOutlined /> {v || '(제목 없음)'}</a>
        </Tooltip>
      ),
    },
    {
      title: '올린이', dataIndex: 'uploaderName', key: 'uploaderName', width: 120,
      render: (v) => v
        ? <Space size={7}><Avatar size={22} style={{ background: avatarColor(v), fontSize: 12 }}>{initial(v)}</Avatar>{v}</Space>
        : <Typography.Text type="secondary">-</Typography.Text>,
    },
    { title: '크기', dataIndex: 'size', key: 'size', width: 90, render: fmtSize },
    { title: '등록일', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (v) => dayjs(v).format('YYYY-MM-DD') },
  ];

  const total = data.total || 0;
  const opts = [
    { label: `전체 (${total})`, value: '' },
    ...Object.entries(SOURCE).map(([k, v]) => ({ label: `${v.label}${data.counts[k] ? ` (${data.counts[k]})` : ''}`, value: k })),
  ];

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}><FileOutlined /> 문서함</Typography.Title>
      <Typography.Paragraph type="secondary">
        업무·보드·게시판·결재·메일에 첨부된 파일을 한 곳에서 검색합니다. (메일·결재는 본인 관련만 표시)
      </Typography.Paragraph>
      <Space className="fd-toolbar" style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Segmented options={opts} value={source} onChange={setSource} />
        <Input.Search allowClear placeholder="파일명 검색" style={{ width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} />
      </Space>
      <Table
        rowKey="key" columns={columns} dataSource={data.items} loading={loading} size="small"
        pagination={{ pageSize: 20, showTotal: (t) => `총 ${t}건` }}
        locale={{ emptyText: '첨부 파일이 없습니다.' }}
      />
    </div>
  );
}
