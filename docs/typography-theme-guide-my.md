# Lumini Typography နှင့် Theme အသုံးပြုနည်းလမ်းညွှန်

Lumini Studio ကို module တစ်ခုချင်းစီမှာ font size မတူခြင်း၊ white mode မှာ စာသားမမြင်ရခြင်း၊ dark mode မှာ secondary text မရှင်းခြင်းတွေ မဖြစ်စေရန် typography နဲ့ color token စနစ်တစ်ခုတည်း အသုံးပြုအောင် ပြင်ဆင်ထားပါတယ်။ ဒီပြင်ဆင်မှုတွေဟာ Dashboard၊ Translation၊ Transcription၊ Voiceover၊ Video Studio၊ Subtitle Studio၊ Movie Recap နဲ့ Profile အပါအဝင် authenticated application area အားလုံးကို သက်ရောက်ပါတယ်။

## Typography စည်းမျဉ်း

Application ထဲက heading တွေကို အောက်ပါ role-based scale အတိုင်း သတ်မှတ်ထားပါတယ်။ `h1` ကို module/page title အဖြစ်၊ `h2` ကို section title အဖြစ်၊ `h3` ကို card title အဖြစ်၊ `h4` ကို label-level heading အဖြစ် သုံးရပါမယ်။ Module-specific CSS ထဲမှာ font size ထပ်မရေးဘဲ ဒီ shared scale ကို အသုံးပြုရင် နောင်ထပ်ထည့်မယ့် module တွေမှာလည်း UI တစ်ခုလုံး တစ်ပုံစံတည်း ဖြစ်နေပါမယ်။

| UI role | Standard size | သုံးစွဲရမည့်နေရာ |
|---|---:|---|
| Page / module title (`h1`) | 20px | Module ရဲ့ အဓိကခေါင်းစဉ် |
| Section title (`h2`) | 16px | Form section၊ output section၊ major panel |
| Card title (`h3`) | 14px | Tool card၊ production option၊ history item |
| Small heading (`h4`) | 12px | Compact metadata section |
| Form label | 12px | Input၊ textarea၊ select အမည် |
| Normal control text | 14px | Input၊ textarea၊ select အတွင်းစာသား |
| Body text (`movie-body`) | 14px | Description၊ result၊ explanatory text |
| Metadata (`movie-meta`) | 12px | Credit၊ status၊ timestamp၊ helper metadata |

မြန်မာစာသားတွေ မဖြတ်တောက်သွားစေရန် heading၊ label၊ button၊ input၊ textarea၊ select နဲ့ paragraph တွေမှာ line-height ကိုလည်း တစ်သမတ်တည်း ထိန်းထားပါတယ်။ Font stack မှာ Inter နဲ့ Noto Sans Myanmar ကို အစဉ်လိုက်သုံးထားပြီး system fallback ပါဝင်ပါတယ်။

## Light mode နှင့် Dark mode

Theme နှစ်မျိုးလုံးမှာ page background၊ surface၊ border၊ primary text၊ secondary text၊ muted text နဲ့ focus color တွေကို CSS variable token များဖြင့် ထိန်းထားပါတယ်။ ဒါကြောင့် module တစ်ခုချင်းစီက `text-white` သို့မဟုတ် `text-zinc-400` လို hard-coded color ကို မလိုအပ်ဘဲ semantic text role များကို သုံးနိုင်ပါတယ်။

| Semantic role | Light mode | Dark mode | အသုံးပြုရန် |
|---|---|---|---|
| Primary text | Deep navy | Near-white | Heading၊ အဓိက result |
| Secondary text | Slate gray | Light zinc | Description၊ body text |
| Muted text | Medium slate | Muted zinc | Metadata၊ helper text |
| Surface | White / translucent white | Dark translucent surface | Card၊ glass panel |
| Border | Light slate | Translucent white | Card၊ input၊ divider |
| Focus | Orange | Bright orange | Keyboard focus၊ active control |

White mode မှာ မမြင်ရနိုင်တဲ့ အဓိကအကြောင်းရင်းဖြစ်တဲ့ heading တွေကို `#FAFAFA` လို fixed white color သတ်မှတ်ထားခြင်းကို ဖယ်ရှားပြီး theme variable သုံးထားပါတယ်။ Accent color ပါတဲ့ button တွေမှာတော့ button background နဲ့ contrast ဖြစ်စေရန် white text ကို မူလအတိုင်း ထိန်းထားပါတယ်။

## Developer အသုံးပြုရန်

Module အသစ်ထည့်တဲ့အခါ page wrapper ကို `app-main` အတွင်းထားပြီး heading တွေကို semantic HTML (`h1`၊ `h2`၊ `h3`) ဖြင့်ရေးပါ။ UI စာသားအတွက် အရောင်ကို hard-code မလုပ်ဘဲ `ui-text-primary`၊ `ui-text-secondary`၊ `ui-text-muted` သို့မဟုတ် existing Tailwind light/dark pair များကို သုံးပါ။ Dark-only color class များကို light background ပေါ်တွင် မသုံးပါနှင့်။

`movie-h1`၊ `movie-h2`၊ `movie-body` နဲ့ `movie-meta` class များကို အသုံးပြုထားသော legacy module များသည်လည်း shared global scale အတိုင်း အလိုအလျောက် normalize ဖြစ်ပါမယ်။ ထို့ကြောင့် module တစ်ခုချင်းစီမှာ override font size ထပ်ထည့်ခြင်းကို ရှောင်ကြဉ်ပါ။

## စစ်ဆေးရန်

ပြင်ဆင်ပြီးနောက် `npx tsc --noEmit` နှင့် `pnpm build` ကို run လုပ်ပါ။ Browser ထဲမှာ Dashboard နဲ့ အနည်းဆုံး module တစ်ခုကို light mode၊ dark mode နှစ်မျိုးလုံးဖွင့်ပြီး page title၊ section title၊ label၊ input placeholder၊ body text၊ card text နဲ့ error/helper message တွေ မြင်ရမမြင်ရ စစ်ဆေးပါ။ Keyboard ဖြင့် Tab နှိပ်သည့်အခါ focus outline ကိုလည်း စစ်ဆေးပါ။
