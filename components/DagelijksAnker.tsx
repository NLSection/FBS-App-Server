'use client';

// Triggert bij page-mount een fire-and-forget POST naar /api/anker/dagelijks.
// De server controleert idempotent of het anker voor vandaag al bestaat;
// zo niet, dan wordt het nu geschreven (db.backup() + gzip + sidecar).
// Doel: I/O verbergen achter de pagina-load i.p.v. bij de eerstvolgende
// user-actie.

import { useEffect } from 'react';

export default function DagelijksAnker() {
  useEffect(() => {
    fetch('/api/anker/dagelijks', { method: 'POST' }).catch(() => { /* niet-kritiek */ });
  }, []);
  return null;
}
