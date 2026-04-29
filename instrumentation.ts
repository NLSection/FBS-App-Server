export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./lib/migrations');
    await runMigrations();
    if (process.env.NODE_ENV !== 'production') {
      const { controleerBackupDekking } = await import('./lib/backupTabellen');
      controleerBackupDekking();
    }

    // Start externe backup gatekeeper worker
    try {
      const { startGatekeeperWorker } = await import('./lib/backup');
      startGatekeeperWorker();
    } catch { /* nooit blokkerend */ }

    // Heartbeat-worker: signaleert dit apparaat naar extern zodat andere
    // apparaten weten dat er hier iemand actief is. apparaat_naam wordt
    // direct bij start gesynchroniseerd naar `os.hostname()` zodat een
    // restore-overschrijving niet wacht op de eerste tick.
    try {
      const { startHeartbeatWorker, syncApparaatNaam } = await import('./lib/heartbeat');
      syncApparaatNaam();
      startHeartbeatWorker();
    } catch { /* nooit blokkerend */ }

    // Auto-verwijder vervallen categorieregels op basis van gebruikersinstelling.
    try {
      const getDb = (await import('./lib/db')).default;
      const inst = getDb().prepare('SELECT regel_auto_archiveer_maanden, aangepast_auto_archiveer_maanden FROM instellingen WHERE id = 1').get() as { regel_auto_archiveer_maanden: number; aangepast_auto_archiveer_maanden: number } | undefined;
      const regelMaanden = inst?.regel_auto_archiveer_maanden ?? 0;
      const aangepastMaanden = inst?.aangepast_auto_archiveer_maanden ?? 0;
      if (regelMaanden > 0) {
        const { autoVerwijderVervaldeRegels } = await import('./lib/categorisatie');
        const n = autoVerwijderVervaldeRegels(regelMaanden);
        if (n > 0 && process.env.NODE_ENV !== 'production') console.log(`[auto-verwijder] ${n} ongebruikte categorieregel${n === 1 ? '' : 's'} verwijderd (drempel: ${regelMaanden} mnd)`);
      }
      if (aangepastMaanden > 0) {
        const { autoArchiveerOudeAangepast } = await import('./lib/categorisatie');
        const n = autoArchiveerOudeAangepast(aangepastMaanden);
        if (n > 0 && process.env.NODE_ENV !== 'production') console.log(`[auto-archiveer] ${n} oude aangepaste categorisatie${n === 1 ? '' : 's'} gearchiveerd (drempel: ${aangepastMaanden} mnd)`);
      }
    } catch { /* nooit blokkerend */ }
  }
}
