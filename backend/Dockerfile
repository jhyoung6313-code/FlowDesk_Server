FROM node:20-alpine

RUN apk add --no-cache openssl

# 한글 인코딩 지원 (UTF-8 로케일)
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci --omit=dev

# Prisma 스키마 복사 및 클라이언트 생성
COPY prisma ./prisma
RUN npx prisma generate

# 소스코드 복사
COPY src ./src

# 업로드 디렉토리 생성
RUN mkdir -p uploads

EXPOSE 4000

# DB 준비 대기 → 마이그레이션 → 시드 → 서버 시작
CMD ["sh", "-c", "\
  echo 'PostgreSQL 준비 대기 중...' && \
  until npx prisma migrate deploy; do \
    echo 'DB 아직 준비 안됨, 5초 후 재시도...'; sleep 5; \
  done && \
  echo '시드 데이터 초기화 중...' && \
  node prisma/seed.js && \
  echo '서버 시작!' && \
  node src/app.js \
"]
