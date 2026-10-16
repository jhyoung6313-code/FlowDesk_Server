import { Component, lazy, Suspense, useCallback, useState } from 'react';
import { Button, Result, Spin, message } from 'antd';
import usePreferenceStore from '../../store/preferenceStore';
import useTaskStore from '../../store/taskStore';
import TaskForm from '../../components/Task/TaskForm';
import useHomeData from './layouts/useHomeData';

/* 메인(/) 화면 — 사용자가 고른 레이아웃을 렌더한다.
   'classic' 은 기존 대시보드(교체 아님), 나머지는 선택지로 추가된 새 레이아웃. 각 레이아웃은 필요할 때만 로드한다. */
const ClassicDashboard = lazy(() => import('./index'));
const LAYOUTS = {
  command: lazy(() => import('./layouts/CommandHome')),
  focus: lazy(() => import('./layouts/FocusHome')),
  board: lazy(() => import('./layouts/BoardHome')),
  brief: lazy(() => import('./layouts/BriefHome')),
};

const Loading = () => (
  <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin size="large" />
  </div>
);

/* 새 레이아웃을 불러오지 못하거나(배포 직후 청크 404·네트워크 오류) 렌더 중 오류가 나도
   앱 전체가 오류 화면이 되지 않게 하고, 기본 대시보드로 돌아갈 수 있게 한다. */
class LayoutBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Result
          status="warning"
          title="선택한 메인 화면을 불러오지 못했습니다"
          subTitle="네트워크 상태를 확인하고 다시 시도하거나, 기본 대시보드로 돌아가세요."
          extra={[
            <Button key="retry" onClick={() => window.location.reload()}>다시 시도</Button>,
            <Button key="classic" type="primary" onClick={this.props.onFallback}>기본 대시보드로</Button>,
          ]}
        />
      </div>
    );
  }
}

/* 새 레이아웃 공통: 데이터 로드 + 업무 추가 폼 */
function NewHome({ Layout }) {
  const data = useHomeData();
  const addTask = useTaskStore((s) => s.addTask);
  const [form, setForm] = useState({ open: false, status: 'pending' });

  const onAddTask = useCallback((status = 'pending') => setForm({ open: true, status }), []);
  // addTask 가 calendarVersion 을 올리므로 useHomeData 가 자동으로 다시 불러온다 (명시적 reload 불필요)
  const submit = useCallback(async (values) => {
    await addTask(values);
    message.success('업무가 등록되었습니다.');
  }, [addTask]);

  return (
    <>
      <Layout data={data} onAddTask={onAddTask} />
      <TaskForm
        open={form.open}
        task={null}
        initialStatus={form.status}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSubmit={async (values) => { await submit(values); setForm((f) => ({ ...f, open: false })); }}
      />
    </>
  );
}

export default function HomeRouter() {
  const layout = usePreferenceStore((s) => s.homeLayout);
  const setHomeLayout = usePreferenceStore((s) => s.setHomeLayout);
  const Layout = LAYOUTS[layout];
  return (
    <LayoutBoundary key={layout} onFallback={() => setHomeLayout('classic')}>
      <Suspense fallback={<Loading />}>
        {Layout ? <NewHome Layout={Layout} /> : <ClassicDashboard />}
      </Suspense>
    </LayoutBoundary>
  );
}
