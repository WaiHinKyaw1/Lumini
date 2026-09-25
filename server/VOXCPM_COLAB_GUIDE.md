# 🎙️ Google Colab ဖြင့် VoxCPM2 Free GPU API အသုံးပြုနည်း

Google Colab (Free T4 GPU) ပေါ်တွင် **VoxCPM2 (OpenBMB 48kHz Studio Voice Cloner)** ကို ၁၀၀% အခမဲ့ Run ပြီး Lumini နှင့် ချိတ်ဆက်အသုံးပြုနိုင်သည့် အဆင့်များ ဖြစ်ပါသည်-

---

### အဆင့် (၁) - Google Colab ဖွင့်လှစ်ခြင်း
1. Browser တွင် [Google Colab](https://colab.research.google.com/) သို့ သွားပါ။
2. **Upload** tab ကို ရွေးပြီး `server/VoxCPM_Colab_Free_GPU.ipynb` ဖိုင်ကို တင်ပါ (သို့မဟုတ် New Notebook အသစ်ဖွင့်ပါ)။

---

### အဆင့် (၂) - GPU သတ်မှတ်ပြီး Run ခြင်း
1. Colab မီနူးဘားမှ `Runtime` -> `Change runtime type` -> **T4 GPU** ကို ရွေးချယ်ပြီး Save နှိပ်ပါ။
2. Cell အားလုံးကို အပေါ်မှအောက်သို့ **Run (Play button)** နှိပ်ပေးပါ။
3. မော်ဒယ် download လုပ်ပြီးသည်နှင့် အောက်ခြေတွင် Cloudflare Free Public HTTPS URL ထွက်လာပါမည်:
   ```text
   =======================================================
   🎉 VoxCPM2 Free GPU API is Live!
   👉 Your Free API URL: https://xxxx-xxxx.trycloudflare.com
   =======================================================
   ```

---

### အဆင့် (၃) - Lumini နှင့် ချိတ်ဆက်ခြင်း
1. ထွက်လာသော `https://xxxx-xxxx.trycloudflare.com` URL ကို ကူးယူပါ။
2. Lumini ၏ `.env` ဖိုင်တွင် ထည့်သွင်းပါ:
   ```env
   VITE_MEDIA_WORKER_URL=https://xxxx-xxxx.trycloudflare.com
   ```
3. ယခု [Voiceover Studio](file:///d:/Lumini/pages/Voiceover.tsx) တွင် မိမိအသံ / Sample Voice ဖြင့် 48kHz စက်ရုပ်သံကင်းစင်သော Zero-Shot Voiceover ကို အခမဲ့ ထုတ်ယူနိုင်ပါပြီ!
