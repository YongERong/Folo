import type { ByokStreamEvent } from "@follow/shared/ai/byok"
import { BYOK_STREAM_CHANNEL } from "@follow/shared/ai/byok"
import { IN_ELECTRON } from "@follow/shared/constants"

export const listenToByokStream = (
  streamId: string,
  handlers: {
    onEvent: (event: ByokStreamEvent) => void
    onComplete: () => void
  },
) => {
  if (!IN_ELECTRON || !window.electron?.ipcRenderer) {
    handlers.onComplete()
    return () => {}
  }

  const { ipcRenderer } = window.electron

  const listener = (_event: unknown, payload: ByokStreamEvent) => {
    if (payload.streamId !== streamId) return

    handlers.onEvent(payload)

    if (payload.type === "finish" || payload.type === "error") {
      handlers.onComplete()
    }
  }

  ipcRenderer.on(BYOK_STREAM_CHANNEL, listener)

  return () => {
    ipcRenderer.removeListener(BYOK_STREAM_CHANNEL, listener)
  }
}
