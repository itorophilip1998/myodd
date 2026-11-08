# Generation explanations and active tickets (v0.2.21)

The latest failed Lagoslife requests had 101 eligible events and over 13,000 eligible selections, but their minimum and maximum ticket odds were both 10000. The search returned zero candidates for that exact target. Earlier requests using a wider range produced tickets. The UI incorrectly collapsed every shortage into “No eligible matches”.

Generation results now use the stored report to distinguish an empty eligible pool from a constrained search. An exact-odds shortage names the target and suggests widening the range. Other search shortages suggest adjusting the odds/options. Bookmaker verification failures retain their own explanation. Missing diagnostics use a general search-shortage explanation rather than asserting that there were no matches. Explicit generation constraints remain intact.

Ticket interaction now selects one active card per collection. Opening its menu, viewing details, copying, or loading it keeps the card highlighted after the menu or external tab closes. The selection is saved in session storage for that collection, survives reload/navigation, and changes when another ticket is selected. Hovering a different card does not replace the active selection. The active border remains visible on live-ticket cards.

Validation: shared build, web/API TypeScript checks, 272 API tests passed (seven database tests skipped), and five targeted browser scenarios passed. Browser checks cover exact-target explanations, truly empty pools, copy/details interaction, five-card layout, menu dismissal, loading, reload persistence, and selection changes.

The production Docker web build passed. The local web container was replaced without restarting its dependencies, passed its health check, and served the v0.2.21 footer. Visual inspection confirmed the selected card has a persistent border, background, and booking-code highlight.
