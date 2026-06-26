import { useEffect, useState, useCallback } from 'react';
import {
  Card, Row, Col, Statistic, Table, Button, Modal, Form, Input, Select,
  DatePicker, Space, Tag, Tabs, Popconfirm, message, Typography, Segmented,
  ColorPicker, Progress, Switch, InputNumber, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined,
  ArrowUpOutlined, ArrowDownOutlined, WalletOutlined, SyncOutlined,
  FileExcelOutlined, ReloadOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Sector,
} from 'recharts';
import dayjs from 'dayjs';
import * as ledgerApi from '../../api/ledger';
import useThemeStore from '../../store/themeStore';

const { Title, Text } = Typography;
const { Option } = Select;

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

const fmt = (n) => Number(n).toLocaleString('ko-KR');

const renderActiveShape = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 12} textAnchor="middle" fill={fill} fontSize={13} fontWeight={600}>{payload.name}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#555" fontSize={12}>{fmt(value)}원</text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

export default function LedgerPage() {
  const isDark = useThemeStore((s) => s.isDark);

  const [selectedYear, setSelectedYear] = useState(dayjs().year());
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month() + 1);

  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [recurrings, setRecurrings] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [activePieIdx, setActivePieIdx] = useState(0);

  // 거래 모달
  const [entryModal, setEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryForm] = Form.useForm();

  // 카테고리 관리 모달
  const [catModal, setCatModal] = useState(false);
  const [catForm] = Form.useForm();
  const [editingCat, setEditingCat] = useState(null);
  const [catColor, setCatColor] = useState('#1677ff');

  // 예산 설정 (카테고리 모달 내 탭)
  const [budgetInputs, setBudgetInputs] = useState({});
  const [budgetSaving, setBudgetSaving] = useState(false);

  // 반복 거래 모달
  const [recurModal, setRecurModal] = useState(false);
  const [editingRecur, setEditingRecur] = useState(null);
  const [recurForm] = Form.useForm();
  const [applyingRecur, setApplyingRecur] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, cats, recs] = await Promise.all([
        ledgerApi.getSummary({ year: selectedYear, month: selectedMonth }),
        ledgerApi.getCategories(),
        ledgerApi.getRecurrings(),
      ]);
      setSummary(sum);
      setCategories(cats);
      setRecurrings(recs);

      // 예산 입력 초기화
      const bmap = {};
      (sum.budgetSummary || []).forEach((b) => {
        if (b.budget !== null) bmap[b.categoryId] = b.budget;
      });
      setBudgetInputs(bmap);

      const params = { year: selectedYear, month: selectedMonth, page, limit: PAGE_SIZE };
      if (filterType !== 'all') params.type = filterType;
      const res = await ledgerApi.getEntries(params);
      setEntries(res.entries);
      setTotal(res.total);
    } catch {
      message.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, filterType, page]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── 거래 CRUD ── */
  const openEntryModal = (entry = null) => {
    setEditingEntry(entry);
    if (entry) {
      entryForm.setFieldsValue({ type: entry.type, amount: entry.amount, categoryId: entry.categoryId, date: dayjs(entry.date), memo: entry.memo });
    } else {
      entryForm.resetFields();
      entryForm.setFieldsValue({ type: 'expense', date: dayjs() });
    }
    setEntryModal(true);
  };

  const handleEntrySave = async () => {
    try {
      const vals = await entryForm.validateFields();
      const payload = { ...vals, date: vals.date.format('YYYY-MM-DD') };
      if (editingEntry) {
        await ledgerApi.updateEntry(editingEntry.id, payload);
        message.success('수정되었습니다.');
      } else {
        await ledgerApi.createEntry(payload);
        message.success('추가되었습니다.');
      }
      setEntryModal(false);
      setPage(1);
      loadAll();
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장 실패');
    }
  };

  const handleEntryDelete = async (id) => {
    try {
      await ledgerApi.deleteEntry(id);
      message.success('삭제되었습니다.');
      loadAll();
    } catch {
      message.error('삭제 실패');
    }
  };

  /* ── 카테고리 CRUD ── */
  const openCatModal = (cat = null) => {
    setEditingCat(cat);
    if (cat) {
      catForm.setFieldsValue({ name: cat.name, type: cat.type });
      setCatColor(cat.color);
    } else {
      catForm.resetFields();
      setCatColor('#1677ff');
    }
    setCatModal(true);
  };

  const handleCatSave = async () => {
    try {
      const vals = await catForm.validateFields();
      const payload = { ...vals, color: catColor };
      if (editingCat) {
        await ledgerApi.updateCategory(editingCat.id, payload);
      } else {
        await ledgerApi.createCategory(payload);
      }
      message.success('저장되었습니다.');
      setCatModal(false);
      loadAll();
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장 실패');
    }
  };

  const handleCatDelete = async (id) => {
    try {
      await ledgerApi.deleteCategory(id);
      message.success('삭제되었습니다.');
      loadAll();
    } catch (err) {
      message.error(err?.response?.data?.error || '삭제 실패');
    }
  };

  /* ── 예산 저장 ── */
  const handleBudgetSave = async () => {
    setBudgetSaving(true);
    try {
      const expenseCats = categories.filter((c) => c.type === 'expense');
      for (const cat of expenseCats) {
        const val = budgetInputs[cat.id];
        if (val != null && val > 0) {
          await ledgerApi.upsertBudget({ categoryId: cat.id, year: selectedYear, month: selectedMonth, amount: val });
        }
      }
      message.success('예산이 저장되었습니다.');
      loadAll();
    } catch {
      message.error('저장 실패');
    } finally {
      setBudgetSaving(false);
    }
  };

  /* ── 반복 거래 CRUD ── */
  const openRecurModal = (rec = null) => {
    setEditingRecur(rec);
    if (rec) {
      recurForm.setFieldsValue({ type: rec.type, amount: Number(rec.amount), categoryId: rec.categoryId, dayOfMonth: rec.dayOfMonth, memo: rec.memo });
    } else {
      recurForm.resetFields();
      recurForm.setFieldsValue({ type: 'expense', dayOfMonth: 1 });
    }
  };

  const handleRecurSave = async () => {
    try {
      const vals = await recurForm.validateFields();
      if (editingRecur) {
        await ledgerApi.updateRecurring(editingRecur.id, vals);
        message.success('수정되었습니다.');
      } else {
        await ledgerApi.createRecurring(vals);
        message.success('추가되었습니다.');
      }
      setEditingRecur(null);
      recurForm.resetFields();
      recurForm.setFieldsValue({ type: 'expense', dayOfMonth: 1 });
      loadAll();
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장 실패');
    }
  };

  const handleRecurDelete = async (id) => {
    try {
      await ledgerApi.deleteRecurring(id);
      message.success('삭제되었습니다.');
      loadAll();
    } catch {
      message.error('삭제 실패');
    }
  };

  const handleApplyRecurring = async () => {
    setApplyingRecur(true);
    try {
      const result = await ledgerApi.applyRecurring({ year: selectedYear, month: selectedMonth });
      message.success(result.message);
      loadAll();
    } catch {
      message.error('적용 실패');
    } finally {
      setApplyingRecur(false);
    }
  };

  /* ── Excel 내보내기 ── */
  const handleExport = async () => {
    try {
      await ledgerApi.exportExcel({ year: selectedYear, month: selectedMonth });
    } catch {
      message.error('내보내기 실패');
    }
  };

  /* ── 차트 데이터 ── */
  const barData = summary?.monthlyData?.map((d) => ({ name: MONTH_LABELS[d.month - 1], 수입: d.income, 지출: d.expense })) || [];
  const pieData = summary?.categoryBreakdown?.filter((c) => c.amount > 0) || [];
  const budgetData = summary?.budgetSummary || [];

  const cardStyle = { background: isDark ? '#2a2a2a' : '#fff', borderRadius: 10 };
  const thisMonth = summary?.thisMonth || { income: 0, expense: 0, balance: 0 };

  /* ── 테이블 컬럼 ── */
  const entryColumns = [
    { title: '날짜', dataIndex: 'date', width: 100, render: (v) => dayjs(v).format('MM/DD') },
    {
      title: '유형', dataIndex: 'type', width: 70,
      render: (v) => <Tag color={v === 'income' ? 'success' : 'error'}>{v === 'income' ? '수입' : '지출'}</Tag>,
    },
    {
      title: '카테고리', dataIndex: 'category', width: 110,
      render: (c) => c ? <Tag color={c.color}>{c.name}</Tag> : '-',
    },
    {
      title: '금액', dataIndex: 'amount', align: 'right',
      render: (v, r) => (
        <span style={{ color: r.type === 'income' ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
          {r.type === 'income' ? '+' : '-'}{fmt(v)}원
        </span>
      ),
    },
    { title: '메모', dataIndex: 'memo', ellipsis: true, render: (v) => v || '-' },
    {
      title: '', width: 80,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEntryModal(r)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleEntryDelete(r.id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const catColumns = [
    { title: '이름', dataIndex: 'name', render: (n, r) => <Tag color={r.color}>{n}</Tag> },
    { title: '유형', dataIndex: 'type', render: (v) => v === 'income' ? '수입' : '지출' },
    {
      title: '', width: 90,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openCatModal(r)} />
          <Popconfirm title="삭제?" onConfirm={() => handleCatDelete(r.id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const recurColumns = [
    {
      title: '유형', dataIndex: 'type', width: 70,
      render: (v) => <Tag color={v === 'income' ? 'success' : 'error'}>{v === 'income' ? '수입' : '지출'}</Tag>,
    },
    { title: '카테고리', dataIndex: 'category', width: 110, render: (c) => c ? <Tag color={c.color}>{c.name}</Tag> : '-' },
    { title: '금액', dataIndex: 'amount', align: 'right', render: (v) => `${fmt(v)}원` },
    { title: '매월', dataIndex: 'dayOfMonth', width: 70, render: (v) => `${v}일` },
    { title: '메모', dataIndex: 'memo', ellipsis: true, render: (v) => v || '-' },
    {
      title: '활성', dataIndex: 'isActive', width: 70,
      render: (v, r) => (
        <Switch
          size="small"
          checked={v}
          onChange={async (checked) => {
            await ledgerApi.updateRecurring(r.id, { isActive: checked });
            loadAll();
          }}
        />
      ),
    },
    {
      title: '', width: 80,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openRecurModal(r)} />
          <Popconfirm title="삭제?" onConfirm={() => handleRecurDelete(r.id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          <WalletOutlined style={{ marginRight: 8, color: '#52c41a' }} />가계부
        </Title>
        <Space wrap>
          <DatePicker
            picker="year"
            value={dayjs().year(selectedYear)}
            onChange={(d) => { if (d) { setSelectedYear(d.year()); setPage(1); } }}
            allowClear={false}
          />
          <Select value={selectedMonth} onChange={(v) => { setSelectedMonth(v); setPage(1); }} style={{ width: 80 }}>
            {MONTH_LABELS.map((l, i) => <Option key={i + 1} value={i + 1}>{l}</Option>)}
          </Select>
          <Button icon={<SettingOutlined />} onClick={() => setCatModal(true)}>카테고리</Button>
          <Button icon={<SyncOutlined />} onClick={() => setRecurModal(true)}>반복거래</Button>
          <Button icon={<FileExcelOutlined />} onClick={handleExport}>Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEntryModal()}>내역 추가</Button>
        </Space>
      </div>

      {/* ── 이번 달 요약 카드 ── */}
      <Row gutter={[16, 12]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card style={cardStyle}>
            <Statistic title={`${selectedMonth}월 총 수입`} value={thisMonth.income} suffix="원"
              formatter={(v) => fmt(v)} valueStyle={{ color: '#52c41a' }} prefix={<ArrowUpOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={cardStyle}>
            <Statistic title={`${selectedMonth}월 총 지출`} value={thisMonth.expense} suffix="원"
              formatter={(v) => fmt(v)} valueStyle={{ color: '#ff4d4f' }} prefix={<ArrowDownOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={cardStyle}>
            <Statistic title={`${selectedMonth}월 잔액`} value={thisMonth.balance} suffix="원"
              formatter={(v) => fmt(v)}
              valueStyle={{ color: thisMonth.balance >= 0 ? '#1677ff' : '#ff4d4f' }}
              prefix={<WalletOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* ── 차트 영역 ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={15}>
          <Card
            title={`${selectedYear}년 월별 수입/지출`}
            style={cardStyle}
            extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>막대 클릭 시 해당 월로 이동</Typography.Text>}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={barData}
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                onClick={(data) => {
                  if (!data?.activePayload) return;
                  const clickedName = data.activeLabel;
                  const monthIdx = MONTH_LABELS.indexOf(clickedName);
                  if (monthIdx >= 0) {
                    setSelectedMonth(monthIdx + 1);
                    setPage(1);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#333' : '#f0f0f0'} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v} tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v) => `${fmt(v)}원`} />
                <Legend />
                <Bar dataKey="수입" fill="#52c41a" radius={[3, 3, 0, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill="#52c41a" opacity={i + 1 === selectedMonth ? 1 : 0.55} />
                  ))}
                </Bar>
                <Bar dataKey="지출" fill="#ff4d4f" radius={[3, 3, 0, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill="#ff4d4f" opacity={i + 1 === selectedMonth ? 1 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title={`${selectedMonth}월 지출 카테고리`} style={cardStyle}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    activeIndex={activePieIdx}
                    activeShape={renderActiveShape}
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80}
                    dataKey="amount" nameKey="name"
                    onMouseEnter={(_, idx) => setActivePieIdx(idx)}
                  >
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>
                지출 내역이 없습니다
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 예산 현황 ── */}
      {budgetData.length > 0 && (
        <Card
          title={`${selectedMonth}월 예산 현황`}
          style={{ ...cardStyle, marginBottom: 20 }}
        >
          <Row gutter={[16, 12]}>
            {budgetData.map((b) => {
              const pct = b.budget ? Math.min(Math.round((b.actual / b.budget) * 100), 100) : 0;
              const isOver = b.budget && b.actual > b.budget;
              return (
                <Col span={12} key={b.categoryId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Space size={4}>
                      <Tag color={b.color} style={{ margin: 0 }}>{b.name}</Tag>
                      {isOver && (
                        <Tooltip title={`예산 초과: ${fmt(b.actual - b.budget)}원`}>
                          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                        </Tooltip>
                      )}
                    </Space>
                    <Text style={{ fontSize: 12, color: isOver ? '#ff4d4f' : '#666' }}>
                      {fmt(b.actual)}원 {b.budget ? `/ ${fmt(b.budget)}원` : '(예산 미설정)'}
                    </Text>
                  </div>
                  {b.budget ? (
                    <Progress
                      percent={pct}
                      size="small"
                      strokeColor={isOver ? '#ff4d4f' : pct >= 80 ? '#fa8c16' : '#52c41a'}
                      showInfo={false}
                    />
                  ) : (
                    <Progress percent={0} size="small" showInfo={false} />
                  )}
                </Col>
              );
            })}
          </Row>
        </Card>
      )}

      {/* ── 거래 내역 테이블 ── */}
      <Card
        title={`${selectedYear}년 ${selectedMonth}월 거래 내역`}
        style={cardStyle}
        extra={
          <Segmented
            value={filterType}
            onChange={(v) => { setFilterType(v); setPage(1); }}
            options={[
              { label: '전체', value: 'all' },
              { label: '수입', value: 'income' },
              { label: '지출', value: 'expense' },
            ]}
          />
        }
      >
        <Table
          rowKey="id"
          dataSource={entries}
          columns={entryColumns}
          loading={loading}
          size="small"
          pagination={{ current: page, pageSize: PAGE_SIZE, total, onChange: (p) => setPage(p), showSizeChanger: false, showTotal: (t) => `총 ${t}건` }}
        />
      </Card>

      {/* ── 거래 입력 모달 ── */}
      <Modal title={editingEntry ? '내역 수정' : '내역 추가'} open={entryModal}
        onOk={handleEntrySave} onCancel={() => setEntryModal(false)} okText="저장" cancelText="취소" width={440}>
        <Form form={entryForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="type" label="유형" rules={[{ required: true }]}>
            <Select>
              <Option value="income">수입</Option>
              <Option value="expense">지출</Option>
            </Select>
          </Form.Item>
          <Form.Item name="categoryId" label="카테고리" rules={[{ required: true, message: '카테고리를 선택하세요.' }]}>
            <Select showSearch placeholder="카테고리 선택" optionFilterProp="children">
              {categories.map((c) => (
                <Option key={c.id} value={c.id}>
                  <Tag color={c.color} style={{ marginRight: 6 }}>{c.name}</Tag>
                  <span style={{ fontSize: 11, color: '#888' }}>{c.type === 'income' ? '수입' : '지출'}</span>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="금액 (원)" rules={[{ required: true, message: '금액을 입력하세요.' }]}>
            <Input type="number" min={1} placeholder="예: 50000" suffix="원" />
          </Form.Item>
          <Form.Item name="date" label="날짜" rules={[{ required: true, message: '날짜를 선택하세요.' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="메모 (선택)" maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 카테고리 관리 모달 ── */}
      <Modal title="카테고리 관리" open={catModal} footer={null}
        onCancel={() => { setCatModal(false); setEditingCat(null); catForm.resetFields(); }} width={560}>
        <Tabs
          items={[
            {
              key: 'list',
              label: '카테고리 목록',
              children: (
                <>
                  <div style={{ marginBottom: 12, textAlign: 'right' }}>
                    <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openCatModal()}>새 카테고리</Button>
                  </div>
                  <Table rowKey="id" dataSource={categories} columns={catColumns} size="small" pagination={false} />
                </>
              ),
            },
            {
              key: 'form',
              label: editingCat ? '카테고리 수정' : '카테고리 추가',
              children: (
                <Form form={catForm} layout="vertical" style={{ marginTop: 8 }}>
                  <Form.Item name="name" label="카테고리명" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
                    <Input placeholder="예: 식비" maxLength={50} />
                  </Form.Item>
                  <Form.Item name="type" label="유형" rules={[{ required: true }]}>
                    <Select><Option value="income">수입</Option><Option value="expense">지출</Option></Select>
                  </Form.Item>
                  <Form.Item label="색상">
                    <ColorPicker value={catColor} onChange={(c) => setCatColor(c.toHexString())} showText />
                  </Form.Item>
                  <Space>
                    <Button type="primary" onClick={handleCatSave}>저장</Button>
                    <Button onClick={() => { setEditingCat(null); catForm.resetFields(); setCatColor('#1677ff'); }}>초기화</Button>
                  </Space>
                </Form>
              ),
            },
            {
              key: 'budget',
              label: '예산 설정',
              children: (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    {selectedYear}년 {selectedMonth}월 지출 카테고리별 예산을 설정합니다.
                  </Text>
                  {categories.filter((c) => c.type === 'expense').map((cat) => (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 12 }}>
                      <Tag color={cat.color} style={{ minWidth: 80, textAlign: 'center' }}>{cat.name}</Tag>
                      <InputNumber
                        style={{ flex: 1 }}
                        min={0}
                        step={10000}
                        value={budgetInputs[cat.id] ?? null}
                        onChange={(v) => setBudgetInputs((prev) => ({ ...prev, [cat.id]: v }))}
                        formatter={(v) => v ? `${Number(v).toLocaleString('ko-KR')}` : ''}
                        parser={(v) => v?.replace(/,/g, '')}
                        placeholder="예산 미설정"
                        suffix="원"
                      />
                    </div>
                  ))}
                  <Button type="primary" loading={budgetSaving} onClick={handleBudgetSave} style={{ marginTop: 8 }}>
                    예산 저장
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Modal>

      {/* ── 반복 거래 모달 ── */}
      <Modal
        title="반복 거래 관리"
        open={recurModal}
        footer={null}
        onCancel={() => { setRecurModal(false); setEditingRecur(null); recurForm.resetFields(); }}
        width={680}
      >
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">매월 자동으로 등록할 고정 거래를 관리합니다.</Text>
          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={applyingRecur}
              onClick={handleApplyRecurring}
            >
              {selectedMonth}월 적용
            </Button>
          </Space>
        </div>

        <Table
          rowKey="id"
          dataSource={recurrings}
          columns={recurColumns}
          size="small"
          pagination={false}
          style={{ marginBottom: 16 }}
        />

        <Card size="small" title={editingRecur ? '반복거래 수정' : '반복거래 추가'} style={{ marginTop: 8 }}>
          <Form form={recurForm} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Form.Item name="type" label="유형" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
              <Select style={{ width: 90 }}>
                <Option value="income">수입</Option>
                <Option value="expense">지출</Option>
              </Select>
            </Form.Item>
            <Form.Item name="categoryId" label="카테고리" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
              <Select style={{ width: 120 }} showSearch optionFilterProp="children">
                {categories.map((c) => <Option key={c.id} value={c.id}><Tag color={c.color}>{c.name}</Tag></Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="amount" label="금액" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
              <InputNumber min={1} style={{ width: 120 }} formatter={(v) => v ? Number(v).toLocaleString('ko-KR') : ''} parser={(v) => v?.replace(/,/g, '')} suffix="원" />
            </Form.Item>
            <Form.Item name="dayOfMonth" label="매월" style={{ marginBottom: 8 }}>
              <Select style={{ width: 80 }}>
                {DAY_OPTIONS.map((d) => <Option key={d} value={d}>{d}일</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="memo" label="메모" style={{ marginBottom: 8 }}>
              <Input style={{ width: 140 }} placeholder="메모 (선택)" maxLength={100} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 8 }}>
              <Space>
                <Button type="primary" onClick={handleRecurSave}>{editingRecur ? '수정' : '추가'}</Button>
                {editingRecur && (
                  <Button onClick={() => { setEditingRecur(null); recurForm.resetFields(); recurForm.setFieldsValue({ type: 'expense', dayOfMonth: 1 }); }}>
                    취소
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Modal>
    </div>
  );
}
