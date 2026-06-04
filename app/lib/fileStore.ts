// 페이지 간 File 객체 전달용 모듈 싱글턴
// Next.js App Router 클라이언트 내비게이션은 모듈 상태를 유지함
let _file: File | null = null

export const fileStore = {
  set(f: File)      { _file = f },
  get(): File | null { return _file },
  clear()           { _file = null },
}
