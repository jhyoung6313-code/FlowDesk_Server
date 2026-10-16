// 인증이 필요한 다운로드 링크는 네이티브 <a href> 네비게이션으로 열면 401로 실패한다 —
// JWT는 axios 인터셉터(api/axios.js)에만 붙고 브라우저의 네이티브 네비게이션에는 붙지 않는다.
// fetch로 직접 Authorization 헤더를 실어 blob을 받은 뒤 임시 링크로 저장한다.
export function downloadFile(url, filename) {
  const token = localStorage.getItem('token');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => {
      if (!r.ok) throw new Error('download failed');
      return r.blob();
    })
    .then((blob) => {
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename || '';
      a.click();
      URL.revokeObjectURL(objUrl);
    });
}
