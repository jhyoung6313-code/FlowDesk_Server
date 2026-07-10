import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, Typography, Button } from 'antd';
import { UnorderedListOutlined, ProjectOutlined, CalendarOutlined, BarChartOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ListView from './ListView';
import KanbanView from './KanbanView';
import CalendarView from './CalendarView';
import GanttPage from '../Gantt';
import AiTaskGenerator from '../../components/ai/AiTaskGenerator';
import { getAiStatus } from '../../api/ai';

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'list';
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    getAiStatus().then((s) => setAiEnabled(!!s.enabled)).catch(() => {});
  }, []);

  const handleTabChange = (key) => {
    if (key === 'list') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ view: key }, { replace: true });
    }
    if (key === 'calendar') {
      setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    }
  };

  return (
    <div>
      <Typography.Title level={4} style={{ margin: '0 0 4px 0' }}>업무 관리</Typography.Title>
      <Tabs
        activeKey={view}
        onChange={handleTabChange}
        style={{ marginTop: 4 }}
        tabBarExtraContent={
          aiEnabled ? (
            <Button icon={<ThunderboltOutlined />} onClick={() => setAiOpen(true)}>
              AI 업무 생성
            </Button>
          ) : null
        }
        items={[
          {
            key: 'list',
            label: (
              <span>
                <UnorderedListOutlined style={{ marginRight: 6 }} />
                목록
              </span>
            ),
            children: <ListView />,
          },
          {
            key: 'kanban',
            label: (
              <span>
                <ProjectOutlined style={{ marginRight: 6 }} />
                칸반
              </span>
            ),
            children: <KanbanView />,
          },
          {
            key: 'calendar',
            label: (
              <span>
                <CalendarOutlined style={{ marginRight: 6 }} />
                캘린더
              </span>
            ),
            children: <CalendarView isActive={view === 'calendar'} />,
          },
          {
            key: 'gantt',
            label: (
              <span>
                <BarChartOutlined style={{ marginRight: 6 }} />
                간트 차트
              </span>
            ),
            children: <GanttPage embedded />,
          },
        ]}
      />
      <AiTaskGenerator open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}
