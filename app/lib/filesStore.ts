export interface UploadedFile {
  id: string
  file: File
  status: 'idle' | 'uploading' | 'done'
  progress: number
}

let _files: UploadedFile[] = []

export const filesStore = {
  get: (): UploadedFile[] => _files,
  set: (files: UploadedFile[]) => { _files = files },
}
