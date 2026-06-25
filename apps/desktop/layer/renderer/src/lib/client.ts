import type { IpcServices } from "@follow/electron-main"
import type { IpcRenderer } from "electron"
import { createIpcProxy } from "electron-ipc-decorator/client"

export const ipcServices = window.electron?.ipcRenderer
  ? createIpcProxy<IpcServices>(window.electron.ipcRenderer as unknown as IpcRenderer)
  : null

export const requireIpcServices = (): NonNullable<typeof ipcServices> => {
  if (!ipcServices) {
    throw new Error("IPC services are only available in the desktop app.")
  }

  return ipcServices
}
