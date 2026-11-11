---
title: Orders and jobs
audience: business
keywords: order, job, create order, workflow, stage, move, cancel, archive, alterations, alteration, invoice
---

# Orders and jobs

## What this is
Every piece of work in the shop: what was promised, for whom, by when, at what price, and which stage it is at.

## Where to find it
Web and mobile: **Orders**. Orders are grouped by workflow stage.

## Create an order
1. Choose **New order** and pick the customer (add them first under Customers if missing).
2. Pick the item type and name, quantity and the agreed unit price. The server sets the order number and total — you cannot mistype them.
3. Set the promised date. Attach measurements if you saved them.
4. Save. If your connection drops mid-save, saving again with the same details will not duplicate the order.

## The order table and the Manage window
Switch the orders list to **Table** and every row gets a **Manage** button. It opens that one order in a centred window with everything on it: the items and their measurements, the total, the balance due, and every action for that order — move stage, invoice, payment, alterations and the customer link. The window keeps its title in sight, scrolls on its own and closes with **Esc**, the **×** button or a click outside, so the board behind stays readable while you work.

## Move work forward
Use **Move to …** on the order card. Each move is recorded with who did it and when; some stages (for example Ready) queue a WhatsApp message to the customer automatically.

## Payments on an order
**Record payment** lives on the order card — see *Payments and receipts*.

## Alterations
Fitting fix after delivery? Open **Alterations** on the order card, describe the fix (for example "Shorten sleeves by 2 cm") and add it. It counts on the Overview until you press **Mark done**; **Reopen** brings it back if the customer returns.

## Archive and restore
Delivered long ago or created by mistake: **Archive** hides the order but keeps payments and history. **Show archived** → **Restore** brings it back. Archiving asks for confirmation; financial records are never deleted, only corrected.

## Customer tracking link
**Customer link** on the order card creates a private link for this order and lets the customer follow it without an account — status, items, total, balance and due date. They can also confirm their details or ask a question, and it arrives under **Customer messages** on the same card. See *Customer tracking link*.

## Invoice
**Invoice PDF** on the order card downloads a printable invoice: items, total, payments and balance due. Staff without payment permission get an items-and-total copy with a note instead of payment details.

## Common mistakes
- Promising a date before checking the stage board — overdue orders turn red on the Overview.
- Cancelling instead of archiving. Cancel is for work that will never happen; archive is for finished history. Cancellation asks for confirmation and cannot be undone.

## Permission warnings
Creating/editing needs **orders:write**, moving stages needs **orders:transition**, viewing needs **orders:read**, sharing a customer tracking link needs **orders:share**.

## Roman Urdu mein
Order banayein, stage se stage move karein, payment aaye to record karein, aur customer ko order ka status batane ke liye **Customer link** bana kar bhej dein. Table view mein **Manage** dabayein to poora order ek window mein khul jata hai — sab kuch usi jagah milega, aur band karne ke liye **Esc** dabayein. Delivery ke baad fitting ka masla ho to **Alterations** mein likh kar add karein aur kaam ho jane par **Mark done** dabayein. Purane orders ko delete nahi, **Archive** karein.
