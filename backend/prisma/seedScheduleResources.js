/* 회의실·법인차량 기본 자원 시드 (idempotent) — node prisma/seedScheduleResources.js */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULTS = [
  { kind: 'room', name: 'A 회의실', description: '8인 / 대회의실', sortOrder: 1 },
  { kind: 'room', name: 'B 회의실', description: '4인 / 중회의실', sortOrder: 2 },
  { kind: 'room', name: '소회의실', description: '2인 / 집중실', sortOrder: 3 },
  { kind: 'vehicle', name: '12가 3456', description: '쏘렌토 / 5인승', sortOrder: 1 },
  { kind: 'vehicle', name: '34나 5678', description: '스타리아 / 11인승', sortOrder: 2 },
  { kind: 'vehicle', name: '56다 7890', description: '아반떼 / 5인승', sortOrder: 3 },
];

async function main() {
  for (const r of DEFAULTS) {
    const exists = await prisma.scheduleResource.findFirst({ where: { kind: r.kind, name: r.name } });
    if (!exists) {
      await prisma.scheduleResource.create({ data: r });
      console.log('created:', r.kind, r.name);
    }
  }
  console.log('자원 시드 완료');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
