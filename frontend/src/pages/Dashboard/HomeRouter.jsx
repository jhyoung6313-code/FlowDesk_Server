import { lazy, Suspense, useCallback, useState } from 'react';
import { Spin, message } from 'antd';
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

/* 새 레이아웃 공통: 데이터 로드 + 업무 추가 폼 */
function NewHome({ Layout }) {
  const data = useHomeData();
  const addTask = useTaskStore((s) => s.addTask);
  const [form, setForm] = useState({ open: false, status: 'pending' });

  const onAddTask = useCallback((status = 'pending') => setForm({ open: true, status }), []);
  const submit = useCallback(async (values) => {
    await addTask(values);
    message.success('업무가 등록되었습니다.');
    data.reload();
  }, [addTask, data]);

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
  const Layout = LAYOUTS[layout];
  return (
    <Suspense fallback={<Loading />}>
      {Layout ? <NewHome key={layout} Layout={Layout} /> : <ClassicDashboard />}
    </Suspense>
  );
}
