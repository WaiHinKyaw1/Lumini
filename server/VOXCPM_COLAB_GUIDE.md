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
1. ထွက်လာသော `https://xxxx.trycloudflare.com` (သို့မဟုတ် ngrok သုံးပါက `https://xxxx.ngrok-free.app`) URL ကို ကူးယူပါ။
2. Lumini ၏ Voiceover စာမျက်နှာ အပေါ်ရှိ **`VoxCPM GPU`** ခလုတ် သို့မဟုတ် **Settings** ကို နှိပ်ပြီး URL အသစ်ကို ထည့်သွင်းကာ **Save & Connect** (သို့မဟုတ် **Paste & Test**) ကို နှိပ်ပါ:
   - သို့မဟုတ် `.env` ဖိုင်ထဲတွင် တိုက်ရိုက် ထည့်သွင်းနိုင်ပါသည်:
     ```env
     VITE_VOXCPM_URL=https://xxxx-xxxx.trycloudflare.com
     ```
3. စိမ်းရောင်မီး 🟢 **`Active Engine: VoxCPM2 48kHz Colab GPU (Online)`** ပေါ်လာသည်နှင့် Zero-Shot Voiceover ကို ၁၀၀% အခမဲ့ စတင်ထုတ်ယူနိုင်ပါပြီ!

---

### ⚠️ ngrok ပြုတ်ကျခြင်း (ERR_NGROK_3200) နှင့် အကြံပြုချက်:
- **ngrok Free အခမဲ့အကောင့်:** ngrok သည် Free Tier တွင် Session Timeout အချိန်ကန့်သတ်ချက် ရှိပြီး Colab Session ပြတ်သွားတိုင်း (သို့မဟုတ်) Restart ပြန်ချတိုင်း URL အသစ် **(ဥပမာ- `https://xxxx.ngrok-free.app`)** သို့ အလိုအလျောက် ပြောင်းလဲသွားပါသည်။ URL အဟောင်းသည် `ERR_NGROK_3200` ဖြင့် သက်တမ်းကုန်သွားပါမည်။
- **ဖြေရှင်းနည်း:** Colab တွင် ထွက်ပေါ်လာသော URL အသစ်ကို Voiceover စာမျက်နှာရှိ Connection Modal တွင် **Paste & Test** လုပ်ပေးပါ။
- **အထူးအကြံပြုချက်:** ngrok ထက် Cloudflare Tunnel (`trycloudflare.com`) ကို သုံးပါက Session Timeout မရှိဘဲ ပိုမိုငြိမ်သက်စွာ ချိတ်ဆက်နိုင်ပါသည်။
- **Google Colab မပိတ်သွားစေရန် (Keep Alive):** Browser console (F12 -> Console) တွင် အောက်ပါကုဒ်ကို ထည့်သွင်းထားနိုင်ပါသည်:
  ```javascript
  function ConnectButton(){
      console.log("Connect Clicked"); 
      document.querySelector("#top-toolbar > colab-connect-button").shadowRoot.querySelector("#connect").click() 
  }
  setInterval(ConnectButton, 60000);
  ```
