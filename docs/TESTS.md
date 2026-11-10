# Tests performed (database level, on the real project, every test rolled back, no data left behind)

Batch 2: job creation from the shop trigger; verify; nearest-rider offer; second offer refused; reject -> next rider; expiry -> back to queue;
manual offer + accept; double assignment blocked; privacy (other rider sees no customer data); customer/anon/rider blocked from staff functions;
direct table writes blocked; unassign; delivery type locked after job; order cancel cancels job.
Batch 3: application, document path check, approval needs ID + photo, self-approval blocked, member cannot re-apply; pickup (order -> out_for_delivery,
courier details copied); customer code visible only with the tracking token; secrets table closed; wrong code, other rider blocked, delivery by code;
5 wrong codes lock + manager unlock; failed delivery + requeue; give-back before pickup; customer pin validation.
Batch 4: COD cash must match exactly; paid orders: rider collects nothing, no COD ledger row; shop cannot flip payment on packed LocalLane orders;
payout/COD deposit cannot exceed balances and never touch each other; ledger cannot be updated/deleted/inserted from the API; one earning per job;
disputes (duplicate, other rider, resolve twice); only Super Admin changes fees; anon cannot run any delivery/rider function except the two customer ones;
all delivery tables have RLS and no write access for API roles; one open offer per job and one active job per rider are enforced by unique indexes.

# NOT tested (needs a real browser / device or a second connection)
- Building the React site (npm is not reachable in the authoring sandbox): first Cloudflare build is the first compile.
- Real parallel clicks by two riders at the same millisecond (protected by row locks + unique indexes, verified separately; not load-tested).
- Mobile layouts, PWA install, map rendering, document upload to storage, email-code login on the new domain.
- Real LocalLane shop flow after the customer-site patch is deployed.
