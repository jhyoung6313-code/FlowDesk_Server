import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Card, Button, Space, Typography, Alert, Popconfirm, message, List, Tag, Empty,
} from 'antd';
import {
  DownloadOutlined, UploadOutlined, DatabaseOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { downloadBackup, restoreBackup, getAutoBackups, downloadAutoBackup } from '../../api/admin';

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`);

export default function BackupPage() {
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef(null);
  const [autoInfo, setAutoInfo] = useState(null);

  const loadAutoInfo = useCallback(() => {
    getAutoBackups().then(setAutoInfo).catch(() => {});
  }, []);

  useEffect(() => { loadAutoInfo(); }, [loadAutoInfo]);

  const handleBackup = async () => {
    setBacking(true);
    try {
      await downloadBackup();
      message.success('백업 파일이 다운로드되었습니다.');
    } catch {
      message.error('백업에 실패했습니다.');
    } finally {
      setBacking(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    try {
      await restoreBackup(file);
      message.success('데이터 복원이 완료되었습니다.');
    } catch (err) {
      message.error(err?.response?.data?.error || '복원에 실패했습니다.');
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        <DatabaseOutlined style={{ marginRight: 8 }} />
        데이터 백업/복원
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message="백업 파일에는 업무, WBS, 설정 등 모든 데이터가 포함됩니다. 사용자 비밀번호는 포함되지 않습니다."
        style={{ marginBottom: 24 }}
      />

      <Card title="데이터 백업" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Space direction="vertical">
          <Typography.Text type="secondary">
            현재 시스템의 모든 데이터를 JSON 파일로 내보냅니다.
          </Typography.Text>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleBackup}
            loading={backing}
          >
            백업 파일 다운로드
          </Button>
        </Space>
      </Card>

      <Card title={<><ClockCircleOutlined /> 자동 백업</>} style={{ marginBottom: 16, borderRadius: 8 }}>
        {autoInfo ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={autoInfo.enabled ? 'green' : 'default'}>{autoInfo.enabled ? '활성화' : '비활성화'}</Tag>
              {autoInfo.enabled && <Typography.Text type="secondary">cron: {autoInfo.cron} · 서버 로컬에 최근 {autoInfo.retentionCount}개 보관</Typography.Text>}
            </Space>
            {autoInfo.files.length === 0 ? (
              <Empty description="아직 생성된 자동 백업이 없습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={autoInfo.files}
                renderItem={(f) => (
                  <List.Item
                    actions={[
                      <Button key="dl" type="link" size="small" icon={<DownloadOutlined />} onClick={() => downloadAutoBackup(f.filename)}>
                        다운로드
                      </Button>,
                    ]}
                  >
                    <Typography.Text>{f.filename}</Typography.Text>
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>
                      {fmtSize(f.size)} · {dayjs(f.createdAt).format('YYYY-MM-DD HH:mm')}
                    </Typography.Text>
                  </List.Item>
                )}
              />
            )}
          </Space>
        ) : <Typography.Text type="secondary">불러오는 중...</Typography.Text>}
      </Card>

      <Card title="데이터 복원" style={{ borderRadius: 8 }}>
        <Space direction="vertical">
          <Alert
            type="warning"
            showIcon
            message="복원은 기존 데이터를 덮어쓰지 않고 누락된 항목만 추가합니다. 중복 데이터는 업데이트됩니다."
            style={{ marginBottom: 8 }}
          />
          <Typography.Text type="secondary">
            이전에 다운로드한 백업 파일(.enc)을 선택하여 데이터를 복원합니다.
          </Typography.Text>
          <Popconfirm
            title="데이터를 복원하시겠습니까?"
            description="백업 파일의 데이터가 현재 시스템에 적용됩니다."
            onConfirm={() => fileInputRef.current?.click()}
            okText="진행"
            cancelText="취소"
          >
            <Button
              icon={<UploadOutlined />}
              loading={restoring}
            >
              백업 파일 선택하여 복원
            </Button>
          </Popconfirm>
          <input
            ref={fileInputRef}
            type="file"
            accept=".enc"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </Space>
      </Card>
    </div>
  );
}
