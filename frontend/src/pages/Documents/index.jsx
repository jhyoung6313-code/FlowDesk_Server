import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Input, Segmented, Tag, Typography, Space, message, Tooltip, Avatar, Button } from 'antd';
import {
  FileOutlined, FilePdfOutlined, FileImageOutlined, FileExcelOutlined, FileWordOutlined,
  FileZipOutlined, FileTextOutlined, LinkOutlined, DownloadOutlined, StarFilled, StarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getDocuments, toggleDocumentFavorite } from '../../api/documents';
import { getAvatarColor } from '../../utils/colors';
import { downloadFile } from '../../utils/download';

const SOURCE = {
  task: { label: '업무', color: 'blue' }, board: { label: '보드', color: 'cyan' },
  bbs: { label: '게시판', color: 'gold' }, approval: { label: '결재', color: 'orange' }, mail: { label: '메일', color: 'purple' },
  wbs: { label: 'WBS 산출물', color: 'green' },
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
  const [favOnly, setFavOnly] = useState(false);
  const navigate = useNavigate();

  const load = useCallback((query, src, fav) => {
    setLoading(true);
    getDocuments({ ...(query ? { q: query } : {}), ...(src ? { source: src } : {}), ...(fav ? { favorite: '1' } : {}) })
      .then(setData)
      .catch(() => message.error('문서 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  // 최초 진입 시 즉시 로드, 이후 검색어/필터 변경에는 디바운스(300ms)
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      load(q, source, favOnly);
      return;
    }
    const t = setTimeout(() => load(q, source, favOnly), 300);
    return () => clearTimeout(t);
  }, [q, source, favOnly, load]);

  const handleToggleFavorite = (item) => {
    toggleDocumentFavorite(item.source, item.refId)
      .then(() => load(q, source, favOnly))
      .catch(() => message.error('즐겨찾기 변경에 실패했습니다.'));
  };

  const columns = [
    {
      title: '', dataIndex: 'isFavorite', key: 'fav', width: 36,
      render: (v, r) => (
        <Tooltip title={v ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
          <Button
            type="text" size="small"
            icon={v ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
            onClick={() => handleToggleFavorite(r)}
          />
        </Tooltip>
      ),
    },
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
      render: (v, r) => v
        ? <Space size={7}><Avatar size={22} style={{ background: getAvatarColor(r.uploaderId, r.uploaderColor), fontSize: 13 }}>{v[0]}</Avatar>{v}</Space>
        : <Typography.Text type="secondary">-</Typography.Text>,
    },
    { title: '크기', dataIndex: 'size', key: 'size', width: 90, render: fmtSize },
    { title: '등록일', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (v) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '', dataIndex: 'downloadUrl', key: 'download', width: 44,
      render: (v, r) => (
        <Tooltip title="다운로드">
          <Button
            type="text" size="small" icon={<DownloadOutlined />}
            onClick={() => downloadFile(v, r.fileName).catch(() => message.error('다운로드에 실패했습니다.'))}
          />
        </Tooltip>
      ),
    },
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
        업무·보드·게시판·결재·메일·WBS 산출물에 첨부된 파일을 한 곳에서 검색합니다. (메일·결재는 본인 관련만 표시, 텍스트 파일은 본문 내용도 검색됩니다)
      </Typography.Paragraph>
      <Space className="fd-toolbar" style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Space wrap>
          <Segmented options={opts} value={source} onChange={setSource} />
          <Button
            type={favOnly ? 'primary' : 'default'}
            icon={favOnly ? <StarFilled /> : <StarOutlined />}
            onClick={() => setFavOnly((v) => !v)}
          >
            즐겨찾기만
          </Button>
        </Space>
        <Input.Search allowClear placeholder="파일명/내용 검색" style={{ width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} />
      </Space>
      <Table
        rowKey="key" columns={columns} dataSource={data.items} loading={loading} size="small"
        pagination={{ pageSize: 20, showTotal: (t) => `총 ${t}건` }}
        locale={{ emptyText: '첨부 파일이 없습니다.' }}
      />
    </div>
  );
}
