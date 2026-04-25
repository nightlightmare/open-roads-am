'use client'

export function MapSidebar() {
  return (
    <>
      {/* Search & Geo */}
      <div className="border-b border-border p-5">
        {/* Search */}
        <label className="flex items-center gap-2 rounded border border-border bg-muted/50 px-2.5 py-2 transition-colors focus-within:border-foreground">
          <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
          <input
            type="text"
            placeholder="Поиск адреса или улицы..."
            className="flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">/</span>
        </label>

        {/* Geo pills */}
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
            <svg className="h-[13px] w-[13px] text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
            Моя геолокация
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
            <svg className="h-[13px] w-[13px] text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            Ереван центр
          </button>
        </div>

        {/* Stats strip */}
        <div className="mt-4 grid grid-cols-3 overflow-hidden rounded border border-border bg-muted/50">
          <div className="border-r border-border px-3 py-2.5">
            <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">--</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-status-new" />
              новые
            </div>
          </div>
          <div className="border-r border-border px-3 py-2.5">
            <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">--</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-status-work" />
              в работе
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">--</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-status-done" />
              решено
            </div>
          </div>
        </div>
      </div>

      {/* Filters placeholder */}
      <div className="border-b border-border p-5">
        <div className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Фильтры
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Будет добавлено в следующем коммите</p>
      </div>

      {/* List placeholder */}
      <div className="p-0">
        <div className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Список</span>
          <span className="font-mono text-[10px] text-muted-foreground">-- видно</span>
        </div>
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          Список репортов будет добавлен в следующем коммите
        </div>
      </div>
    </>
  )
}
