import { useSearchParams } from 'react-router-dom';
import { Tabs, Typography } from 'antd';
import { UnorderedListOutlined, ProjectOutlined, CalendarOutlined, BarChartOutlined } from '@ant-design/icons';
import ListView from './ListView';
import KanbanView from './KanbanView';
import CalendarView from './CalendarView';
import GanttPage from '../Gantt';

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'list';

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
    </div>
  );
}
