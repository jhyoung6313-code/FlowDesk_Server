import api from './axios';

// 조직 개편: '파트'는 '팀(Team)'으로 대체되었다.
// 업무/간트/칸반/반복업무/템플릿의 분류(필터) 소스로 사용한다. (record.partId = team.id)
export const getParts = () => api.get('/teams').then((r) => r.data);
