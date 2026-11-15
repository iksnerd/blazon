import { useEffect, useState } from 'react';
import type { BlazonData } from '../../types/index.js';

/** blazon build and blazon dev write the brand book's data into index.html as this JSON script. */
function readInjectedData(): BlazonData {
  const script = document.getElementById('blazon-data');
  if (!script?.textContent) throw new Error('[blazon] index.html has no blazon-data script');
  return JSON.parse(script.textContent) as BlazonData;
}

/** The brand book's data, replaced live while `blazon dev` runs. */
export function useBlazonData(): BlazonData {
  const [data, setData] = useState(readInjectedData);

  useEffect(() => {
    const onUpdate = (event: Event) => setData((event as CustomEvent<BlazonData>).detail);
    window.addEventListener('blazon:update', onUpdate);
    return () => window.removeEventListener('blazon:update', onUpdate);
  }, []);

  return data;
}
