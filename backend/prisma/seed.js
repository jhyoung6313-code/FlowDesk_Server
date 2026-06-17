const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('시드 데이터 생성 시작...');

  // 관리자 계정 생성
  const adminHash = await bcrypt.hash('admin1234', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminHash,
      displayName: '관리자',
      role: 'admin',
      isActive: true,
    },
  });

  // 팀원 계정 생성
  const memberHash = await bcrypt.hash('member1234', 10);
  const member1 = await prisma.user.upsert({
    where: { username: 'member1' },
    update: {},
    create: {
      username: 'member1',
      passwordHash: memberHash,
      displayName: '김개발',
      role: 'member',
      isActive: true,
    },
  });

  const member2 = await prisma.user.upsert({
    where: { username: 'member2' },
    update: {},
    create: {
      username: 'member2',
      passwordHash: memberHash,
      displayName: '이기획',
      role: 'member',
      isActive: true,
    },
  });

  // 담당파트 생성
  const devPart = await prisma.part.upsert({
    where: { name: '개발팀' },
    update: {},
    create: { name: '개발팀', description: '개발 담당 파트' },
  });

  const planPart = await prisma.part.upsert({
    where: { name: '기획팀' },
    update: {},
    create: { name: '기획팀', description: '기획 담당 파트' },
  });

  const qaPart = await prisma.part.upsert({
    where: { name: 'QA' },
    update: {},
    create: { name: 'QA', description: '품질보증 파트' },
  });

  // 샘플 업무 생성
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextMonth = new Date(today);
  nextMonth.setDate(today.getDate() + 30);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const task1 = await prisma.task.create({
    data: {
      title: '로그인 화면 개발',
      description: 'JWT 기반 로그인 화면 구현',
      partId: devPart.id,
      priority: 'high',
      status: 'in_progress',
      startDate: today,
      dueDate: nextWeek,
      createdBy: admin.id,
      assignees: {
        create: [{ userId: member1.id }],
      },
    },
  });

  const task2 = await prisma.task.create({
    data: {
      title: '요구사항 정의서 작성',
      description: '시스템 요구사항 분석 및 정의서 작성',
      partId: planPart.id,
      priority: 'normal',
      status: 'done',
      startDate: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000),
      dueDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
      createdBy: admin.id,
      assignees: {
        create: [{ userId: member2.id }],
      },
    },
  });

  const task3 = await prisma.task.create({
    data: {
      title: '대시보드 UI 설계',
      description: '대시보드 화면 와이어프레임 및 UI 설계',
      partId: planPart.id,
      priority: 'high',
      status: 'pending',
      startDate: nextWeek,
      dueDate: nextMonth,
      createdBy: admin.id,
      assignees: {
        create: [{ userId: member2.id }, { userId: member1.id }],
      },
    },
  });

  const task4 = await prisma.task.create({
    data: {
      title: '마감 임박 테스트 업무',
      description: '마감이 2일 후인 테스트 업무',
      partId: qaPart.id,
      priority: 'high',
      status: 'in_progress',
      startDate: today,
      dueDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000),
      createdBy: admin.id,
      assignees: {
        create: [{ userId: member1.id }],
      },
    },
  });

  const task5 = await prisma.task.create({
    data: {
      title: '마감 초과 업무 샘플',
      description: '이미 마감일이 지난 업무',
      partId: devPart.id,
      priority: 'normal',
      status: 'hold',
      startDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000),
      dueDate: yesterday,
      createdBy: admin.id,
      assignees: {
        create: [{ userId: member1.id }],
      },
    },
  });

  // 업무 의존관계
  await prisma.taskDependency.create({
    data: {
      predecessorId: task2.id,
      successorId: task3.id,
      type: 'finish_to_start',
    },
  });

  await prisma.taskDependency.create({
    data: {
      predecessorId: task3.id,
      successorId: task1.id,
      type: 'finish_to_start',
    },
  });

  console.log('시드 데이터 생성 완료!');
  console.log('=============================');
  console.log('로그인 계정:');
  console.log('  관리자: admin / admin1234');
  console.log('  팀원1:  member1 / member1234');
  console.log('  팀원2:  member2 / member1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
