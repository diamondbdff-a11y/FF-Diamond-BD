FF Diamond BD — নিরাপদ আপডেট প্যাক

এই প্যাকে আছে:
- FFX.html: লগইন সফল হলে পেজ রিলোড না করে একই প্রোডাক্ট পেজ ও নির্বাচিত প্যাকেজ ধরে রাখে; লগইন স্ট্যাটাস লোড হলে Login/Buy Now বাটন ও অ্যাকাউন্ট মেনু সঠিকভাবে আপডেট করে।
- server.js: গ্রাহক লগইনে একই ইমেইল+IP থেকে ৪ বার ভুল পাসওয়ার্ড হলে ১৫ মিনিটের সাময়িক লক এবং Support লিংক দেখানোর ব্যবস্থা।

গুরুত্বপূর্ণ:
1. ZIP-টি পুরো ওয়েবসাইট নয়; এটি বর্তমান Render প্রজেক্টে FFX.html ও server.js ফাইল দুটির replacement patch। অন্য ছবি, admin ফাইল, package.json বা অন্যান্য assets মুছবেন না।
2. Render-এর FFX-PASS Environment Variable পরিবর্তন করা হয়নি। আগের মানই রাখবেন।
3. customers.json server.js-এর DATA_DIR/customers.json-এ থাকে। Render-এ Persistent Disk mount করে DATA_DIR-কে সেই disk-এর mount path-এ সেট করতে হবে, নইলে Render restart/deploy-এ ডেটা হারানোর ঝুঁকি থাকবে।
4. এই প্যাকে bKash/Nagad/Rocket-এর live payment gateway বা merchant number যুক্ত করা হয়নি। merchant payment number / gateway credentials না থাকায় টাকা নেওয়া বা payment verify করার ব্যবস্থা বানিয়ে দেওয়া নিরাপদ নয়। তিনটি পাশাপাশি payment option-সহ সম্পূর্ণ payment step আলাদা করে কনফিগার করতে হবে।
5. Forgot Password email OTP-ও এই প্যাকে যুক্ত হয়নি; SMTP/email provider credentials এবং OTP workflow আলাদা করে সেট করতে হবে।

আপলোডের আগে বর্তমান FFX.html ও server.js-এর backup রাখুন।
