# GreenRich ONE — Simple Manufacturing Training / எளிய Production Demo

This is an **interactive training sandbox inside the existing Operations & Production page**. It is not a separate ERP. The four supplied sample products, their processing history and quantities are tagged DEMO and are isolated from real sales, purchasing, inventory, accounting and dispatch.

## How to use (தமிழில்)

1. GreenRich ONE → **Operations & Production** → **Learn Production · Demo**.
2. இடது பக்கம் **Choose a product**. Home Composter / Community Composter / Vendor-made / CoolNSafe sample தேர்வு செய்யவும்.
3. முதலில் **Demo Stock = 0**. Product create செய்தவுடன் actual stock அதிகரிக்காது.
4. **+ Start test production / receipt** → quantity **1** கொடுக்கவும்.
5. வலது பக்கம் **Workflow Map**-ல் தற்போதைய (CURRENT) stage தெரியும்.
6. கீழே note எழுதி **✓ Complete this step** click செய்யவும். Stage 1 முடிந்தவுடன் next stage தானாக வரும். Skipping is not allowed.
7. Community demo **Job Work / Wastage** பகுதியில் issued **50 kg**, net used **8 kg**, scrap **2 kg**, vendor balance **40 kg**, returned **0 kg**. Total = 50; any mismatch is rejected.
8. **Stickering → QC**. QC-ல் **PASS** select செய்து note பதிவு செய்யவும். FAIL என்றால் demo stock கிடைக்காது.
9. Last stage **Finished Stock receipt** முடித்த பிறகே virtual demo stock **0 → 1**.
10. இரண்டாவது training run quantity 1 complete செய்தால் **demo stock 2**. இது **real Stock & Products page stock-ஐ மாற்றாது**.
11. **+ Create test product**: name, SKU, company, manufacturing style choose செய்யவும்; step list மற்றும் parts set செய்யவும். Every product may use a different process. First stock is always zero.

## Four examples

| Demo product | Type | Steps | Parts / source |
|---|---|---|---|
| Home Composter 25L | Simple Assembly | Check 3 parts → assembly → sticker → QC → stock | Sample lid, collection tab, tray |
| Community Composter MGB100 2000L | Multi-level | SFG check → IM/RM check → vendor PO → job work → receive → assembly → sticker → QC → stock | 7 SFG, 5 IM, 18 RM from existing draft material mapping; **not approved BOM** |
| CoolNSafe sanitary napkin | Direct stock / receive | Physical goods received → stock | No manufacturing BOM |
| Vendor-made compost bin | Vendor manufacturing | Vendor PO → receive → sticker → QC → stock | Example outsourced product |

**Do not treat the 50 kg vendor demonstration as a per-product raw-material BOM consumption.** The user's source workbook lists 50 kg for RM-001 without establishing that it is a per-FG consumption quantity.

## Create a custom product workflow

Choose one of Simple Assembly, Multi-level, Vendor Made, Direct Receipt, Custom, then edit stage codes. Allowed codes:

- PARTS = components checked
- SFG = semi-finished goods
- RM = raw materials and intermediate components
- VENDOR_PO = outsourced procurement
- JOBWORK = vendor stock/wastage reconciliation
- RECEIVE = processed or purchased goods received
- ASSEMBLY = final assembly
- STICKER = labels/stickers
- QC = quality inspection
- STOCK = final accepted stock receipt

Rules: STOCK must be the last step. All manufactured product workflows must include STICKER then QC before STOCK; direct receipt must include RECEIVE; Multi-level requires SFG; vendor-made requires VENDOR_PO and RECEIVE. User can add or omit stages appropriate to the product. No stage can be skipped. Custom workflows can be saved only when these rules hold.

## Location in existing CRM

`secure.html` loads `greenrich-workflow-training.js` before `greenrich-operations.js`; operations sidebar → Learn Production · Demo tab.

Supabase migration `20261030151000_operations_workflow_training.sql` stores isolated `gr_erp_demo_products` and `gr_erp_demo_runs` with RLS and authenticated transaction RPCs. Sample data is seeded once, safely idempotent by company + demo SKU.

## Where real production remains different

This demo shows **how** stages and stock should work. It **does not** automatically:
- add SKUs to the real product master;
- decrement physical RM / SFG stock, hold vendor-owned material or post commercial vendor PO;
- create live finished goods inventory, sales availability, finance entries, e-way bills, or real quality documents.

For real production: next connect approved product workflow templates to the existing `gr_crm_records` product, FG stock ledger, serialized receipts, purchase / subcontract documents and transactional QC. Start real product **stock at zero**, then only increase from accepted receipt; do not repurpose the demo tables as inventory balances.

## Implementation checks

1. SQL migration tested in transaction against Supabase, including complete Home (5-step), Community (9-step with 50=8+2+40) and CoolNSafe (2-step) flows. Transaction rolled back, leaving production stock unchanged.
2. `tests/operations-product-workflow-training.js` confirms current CRM loads this UI, stage templates, note history, RLS and no changes to live ledger or masters.
3. Admin or employee granted Operations/Stock create+edit can execute demo stages; view permission can inspect.
4. Every step records actor, timestamp, note and details. The final step is idempotent because completed runs cannot be advanced again.
