# 🎙️ Kaggle Free GPU ဖြင့် VoxCPM2 အသုံးပြုနည်း

Kaggle (Free T4 GPU — **30 hrs/week**) ပေါ်တွင် VoxCPM2 ကို Run ပြီး Lumini နှင့် ချိတ်ဆက်နည်း-

---

## ⚡ Kaggle vs Colab ယှဉ်ချက်:

| Feature | Kaggle Free | Colab Free |
|---------|-------------|------------|
| GPU Time | **30 hrs/week** | ~4-5 hrs/day |
| GPU Type | T4 x2 / P100 | T4 |
| Session Limit | **12 hrs** | ~90 min idle |
| Disconnect Risk | နည်း | မကြာခဏ ပြုတ်ကျ |

---

## အဆင့် (၁) — Kaggle အကောင့်ပြင်ဆင်ခြင်း (တစ်ကြိမ်သာ)

1. [kaggle.com](https://www.kaggle.com) တွင် **Free Account** ဖွင့်ပါ (Google Login ဖြင့်ရပါသည်)
2. **Phone Verification** လုပ်ပါ (Internet access ရရန်):
   - Profile icon → **Settings** → **Phone Verification** → Verify
   - ⚠️ ဒါမလုပ်ရင် Internet access ပိတ်ထားမည်ဖြစ်ပြီး packages install လုပ်လို့ မရပါ

---

## အဆင့် (၂) — ngrok Token ရယူခြင်း (တစ်ကြိမ်သာ)

1. [ngrok.com](https://dashboard.ngrok.com/signup) တွင် **Free Account** ဖွင့်ပါ
2. [Auth Token Page](https://dashboard.ngrok.com/get-started/your-authtoken) မှ Token ကူးယူပါ
3. Token ကို Kaggle Secrets တွင် သိမ်းဆည်းထားပါ (အောက်တွင် ရှင်းပြထားသည်)

---

## အဆင့် (၃) — Notebook Upload & Run

1. [kaggle.com/code](https://www.kaggle.com/code) → **+ New Notebook**
2. **File** → **Import Notebook** → `server/VoxCPM_Kaggle_Free_GPU.ipynb` ကို Upload ပါ
3. ညာဘက် Sidebar Settings:
   - **Accelerator**: `GPU T4 x2` ရွေးပါ
   - **Internet**: `ON` ဖွင့်ပါ
   - **Persistence**: `Files only` ရွေးပါ
4. **ngrok Token** ထည့်သွင်းခြင်း (ပိုလုံခြုံသော နည်းလမ်း):
   - Sidebar → **Add-ons** → **Secrets**
   - **Add a new secret** → Label: `NGROK_AUTH_TOKEN`, Value: `သင်၏ ngrok token`
   - Toggle ON: **Attach to this notebook**
5. Cell များကို အပေါ်မှအောက်သို့ **Run All** နှိပ်ပါ

---

## အဆင့် (၄) — Lumini နှင့် ချိတ်ဆက်ခြင်း

1. Last cell output တွင် ထွက်လာသော URL ကို ကူးယူပါ:
   ```
   👉 https://xxxx-xxxx.ngrok-free.app
   ```
2. Lumini Voiceover Studio → **VoxCPM GPU** → URL Paste → **Save & Connect**
3. `.env` ဖိုင်ထဲတွင်လည်း ထည့်သွင်းနိုင်ပါသည်:
   ```env
   VITE_VOXCPM_URL=https://xxxx-xxxx.ngrok-free.app
   ```
4. 🟢 **Online** ပေါ်လာသည်နှင့် အသုံးပြုနိုင်ပါပြီ!

---

## ⚠️ သတိထားရန်:

- **Session Limit**: Kaggle notebook session တစ်ခုလျှင် **12 နာရီ** အများဆုံး run နိုင်ပါသည်
- **Weekly GPU Quota**: တစ်ပတ်လျှင် **30 နာရီ** GPU အခမဲ့ ရရှိပါသည်
- **ngrok URL ပြောင်းလဲခြင်း**: Session restart/ပြုတ်ကျတိုင်း URL အသစ် ထုတ်ယူရပါမည်
- **Keep Alive**: Last cell သည် keep-alive loop ပါဝင်ပြီး session ကို မပိတ်သွားစေပါ
