import { useEffect, useRef } from "react";
import { API_URL } from "../services/api";

const STREAM_URL = `${API_URL}/visitor-appointments/stream`;
const RETRY_DELAY_MS = 5000;

export function useAppointmentStream(onNewAppointment: () => void) {
  const onNewRef = useRef(onNewAppointment);
  onNewRef.current = onNewAppointment;

  useEffect(() => {
    let xhr: XMLHttpRequest | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      xhr = new XMLHttpRequest();
      xhr.open("GET", STREAM_URL, true);
      xhr.setRequestHeader("Accept", "text/event-stream");
      xhr.setRequestHeader("Cache-Control", "no-cache");

      let lastIndex = 0;

      xhr.onreadystatechange = () => {
        if (xhr!.readyState >= 3 && xhr!.status === 200) {
          const chunk = xhr!.responseText.slice(lastIndex);
          lastIndex = xhr!.responseText.length;

          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload && payload !== "connected") {
              onNewRef.current();
            }
          }
        }

        if (xhr!.readyState === 4 && !unmounted) {
          retryTimer = setTimeout(connect, RETRY_DELAY_MS);
        }
      };

      xhr.send();
    }

    connect();

    return () => {
      unmounted = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (xhr) xhr.abort();
    };
  }, []);
}
