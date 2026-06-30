#!/usr/bin/env bash
# ============================================================
#  Configurare Storia / OLX — completează cele 3 valori mai jos,
#  apoi rulează:   bash setup-storia-env.sh
#  (din folderul crm-imobiliar)
# ============================================================

# 1) Lipește aici cele 3 valori din Application Manager (între ghilimele):
CLIENT_ID="LIPESTE_CLIENT_ID_AICI"
CLIENT_SECRET="LIPESTE_CLIENT_SECRET_AICI"
API_KEY="LIPESTE_API_KEY_AICI"

# 2) Webhook secret — IMPORTANT: copiază valoarea EXACTĂ din câmpul "Notification secret"
#    al aplicației OLX (apasă iconița ochi ca să o vezi). Trebuie să fie identică cu OLX.
WEBHOOK_SECRET="LIPESTE_NOTIFICATION_SECRET_DIN_OLX"

# ------------------------------------------------------------
set -e
if [[ "$CLIENT_ID" == LIPESTE_* || "$CLIENT_SECRET" == LIPESTE_* || "$API_KEY" == LIPESTE_* || "$WEBHOOK_SECRET" == LIPESTE_* ]]; then
  echo "❌ Completează întâi CLIENT_ID, CLIENT_SECRET, API_KEY și WEBHOOK_SECRET în acest fișier."
  exit 1
fi

echo "→ Scriu variabilele în Vercel (production)..."
# Șterge eventuale valori vechi (ignoră erorile dacă nu există)
for V in STORIA_CLIENT_ID STORIA_CLIENT_SECRET STORIA_API_KEY STORIA_WEBHOOK_SECRET; do
  npx vercel env rm "$V" production --yes >/dev/null 2>&1 || true
done

printf '%s' "$CLIENT_ID"      | npx vercel env add STORIA_CLIENT_ID production
printf '%s' "$CLIENT_SECRET"  | npx vercel env add STORIA_CLIENT_SECRET production
printf '%s' "$API_KEY"        | npx vercel env add STORIA_API_KEY production
printf '%s' "$WEBHOOK_SECRET" | npx vercel env add STORIA_WEBHOOK_SECRET production

echo "→ Redeploy producție..."
npx vercel --prod --yes

echo "✅ Gata. Mergi în CRM → Portaluri → 'Conectează cont Storia'."
