# Supabase でデータを複数デバイスで共有する

環境変数に Supabase の URL と Anon Key を設定すると、名簿・レッスン・スケジュールが Supabase に保存され、**どのデバイスから開いても同じデータ**が表示されます。

---

## 用語の説明

| 用語 | 意味 |
|------|------|
| **本番アプリ** | インターネットで公開しているアプリ。例：https://lessonapp3.vercel.app で開くサイト。Vercel にデプロイした「本番用」のサイトのこと。 |
| **NEXT_PUBLIC_SUPABASE_URL** | **変数の名前**です。中に入れる**値**は、Supabase の画面で確認します。Supabase の **Project Settings** → **API** にある **Project URL**（`https://xxxx.supabase.co`）をコピーし、それを「NEXT_PUBLIC_SUPABASE_URL という名前の環境変数」として、.env.local や Vercel の Environment Variables に登録します。 |
| **SQL の実行** | ここでは「Supabase の画面で、SQL Editor を開き、トリガー用の SQL を貼り付けて **Run** ボタンを押す」こと。 |
| **登録の実行** | レッスンアプリの画面で、名前・メール・パスワードを入れて **「登録する」ボタンを押す**こと。 |

**エラー確認の意味**  
- **「SQL の実行時にエラー」** → Supabase の SQL Editor で Run したとき、下に赤いエラーメッセージが出なかったか。出ていれば、その内容を確認する必要があります。  
- **「登録の実行時にエラー」** → アプリで「登録する」を押したときに、画面に「new row violates row-level security policy」と出ること。これをなくすために、先に Supabase でトリガー用 SQL を実行しておく必要があります。

---

## 1. Supabase プロジェクトを作る

1. [supabase.com](https://supabase.com) にログイン（GitHub でサインアップ可）
2. **New project** でプロジェクトを作成（リージョンはお好みで）
3. 作成後、**Project Settings** → **API** で次を控える：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. 環境変数を設定する

プロジェクトのルートに `.env.local` を作成（または既存に追記）し、次の2つを設定します。

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

`.env.local.example` をコピーして `.env.local` にリネームし、値を書き換えてもかまいません。

## 3. データベースにテーブルを作る

Supabase ダッシュボードで **SQL Editor** を開き、次のファイルの内容をそのまま実行します。

- **ファイル**: `supabase/migrations/20250222000000_sync_schema.sql`

または、Supabase の **Table Editor** は使わず、**SQL Editor** にこのマイグレーションの SQL を貼り付けて **Run** してください。  
これで `app_users`（名簿）・`auth_profiles`（認証紐付け）・`day_settings`・`lessons`・`weekly_masters`・`accompanist_availabilities` が作成され、初期名簿も入ります。

**続けて、次の2本の SQL を実行する**  
同じ **SQL Editor** で、**New query** を押してから、それぞれ次のファイルを開き、中身をすべてコピーして貼り付け、**Run** します。  

1. **ファイル**: `supabase/migrations/20250222200000_auth_profiles_rpc.sql`  
   → 新規登録したときに auth_profiles に1行入れるための RPC。実行しないと「new row violates row-level security policy」が出ます。  
2. **ファイル**: `supabase/migrations/20250222300000_check_registered_rpc.sql`  
   → ログアウト後も「この名前は登録済みか」を判定するための RPC。実行しないと、ログアウト後に名前を選んでも「登録」を求められ続けます。

## 4. メール確認をオフにする（任意）

Supabase は標準で「サインアップ時にメール確認」がオンです。  
確認メールなしですぐログインできるようにするには：

1. Supabase の画面で左メニュー **Authentication** をクリック
2. **Providers** タブを開く
3. **Email** の行の「設定」を開く
4. **Confirm email** のスイッチをオフにする

**この設定の意味**  
- **オンのとき**：初めて登録したあと、Supabase から「このメールで登録しました」というメールが届き、そのメール内のリンクをクリックしないとログインできません。  
- **オフのとき**：メールは送られず、登録した直後からそのままログインできます。  
「とりあえずすぐ使いたい」場合はオフ、「本番で本人確認をしっかりしたい」場合はオンのままでよいです。

本番でメール確認をしたい場合はオンのままで、メール内のリンクを踏むとログインできるようになります。

## 5. 動作確認

1. `npm run dev` でアプリを起動
2. 名前を選択して「登録する」でメール・パスワードを設定
3. 別のブラウザやスマホで同じ URL を開き、同じメール・パスワードでログイン
4. 同じ名簿・レッスン・スケジュールが見えれば OK

## よくあるエラー

**「Not authenticated」**  
登録ボタンを押したあとに出る場合、**メール確認（Confirm email）がオンのまま**の可能性が高いです。確認がオンのときは、サインアップ直後は「未確認」扱いになり、RPC が動きません。  
**Authentication** → **Providers** → **Email** を開き、**Confirm email** を**オフ**にしてください。オフにすると、登録後すぐにログインでき、「Not authenticated」も出なくなります。

**「email rate limit exceeded」**  
Supabase が「短い間にメールを送りすぎた」と判断してブロックしています。

**対処**  
1. **Confirm email をオフにする**（メールを送らないようにする）  
   **Authentication** → **Providers** → **Email** を開き、**Confirm email** のスイッチを**オフ**にしてください。オフにすると、新規登録時に確認メールが送られなくなり、この制限にかかりにくくなります。  
2. **しばらく待つ**  
   制限は時間が経つと解除されます（目安：1時間ほど）。それまで新しい登録や「パスワードを忘れた」は試さず、時間をおいてから再度試してください。

**「登録済みの名前を選んでも登録画面になる」「名前だけでログインできない」**  
次の2つがそろっていないと、ログアウト後に「登録済み」と判定できません。

1. **Supabase で RPC を実行しているか**  
   **SQL Editor** で `supabase/migrations/20250222300000_check_registered_rpc.sql` の内容を貼り付けて **Run** しているか確認してください。まだなら実行します。
2. **本番サイト（Vercel）が最新のコードか**  
   この RPC を使うコードを **GitHub に push** し、Vercel の再デプロイが終わってから、本番の URL を **Ctrl+Shift+R** でスーパーリロードして試してください。

両方済んでいれば、登録済みの名前を選ぶと「ログイン」ボタンが表示されます。

**「new row violates row-level security policy for table "auth_profiles"」**  
アカウント登録（名前を選んでメール・パスワードを入力して「登録する」）の直後に出る場合、**RPC 用の SQL がまだ実行されていません**。  
Supabase の **SQL Editor** で、**New query** をクリックし、`supabase/migrations/20250222200000_auth_profiles_rpc.sql` の内容を**すべて**コピーして貼り付け、**Run** してください。成功したら、アプリで再度「登録する」を試します。

## 環境変数を設定していない場合

`NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を**設定しない**と、これまで通り **localStorage のみ**の動作になります（データはそのデバイスだけに保存されます）。

**意味**  
このアプリは「Supabase を使うかどうか」を、**環境変数が入っているか**で判断しています。  
- 環境変数を**入れない** → データは「そのパソコン・そのブラウザの中」だけに保存されます。別のスマホや別のパソコンで開いても、データは共有されません（以前の動きのまま）。  
- 環境変数を**入れる** → データは Supabase のサーバーに保存され、どのデバイスから開いても同じ内容になります。

---

## Vercel で公開している場合

「Vercel の Environment Variables に上記2つを追加し、Redeploy する」とは、次の作業です。

1. ブラウザで [vercel.com](https://vercel.com) を開き、このアプリのプロジェクトを開く  
2. 画面上方の **Settings** をクリック  
3. 左メニューから **Environment Variables** をクリック  
4. **Key** に `NEXT_PUBLIC_SUPABASE_URL`、**Value** に Supabase の Project URL（`https://xxxx.supabase.co`）を入力して **Save**  
5. もう1つ、**Key** に `NEXT_PUBLIC_SUPABASE_ANON_KEY`、**Value** に Supabase の anon key を入力して **Save**  
6. 画面上方の **Deployments** に戻り、いちばん上のデプロイの右側の **⋯** メニューから **Redeploy** を選び、**Redeploy** を実行する  

**意味**  
- いま動かしている「本番のサイト」（例：lessonapp3.vercel.app）は、Vercel のサーバーで動いています。  
- そのサーバーにも「Supabase の住所と鍵」を教えておかないと、本番サイトは Supabase に繋がりません。  
- だから、Vercel の **Environment Variables** に同じ2つを登録し、**Redeploy**（もう一度デプロイし直す）ことで、「本番サイトも Supabase を使う」状態にします。  
- こうすると、本番の URL で開いたときも、複数デバイスで同じデータが共有されます。
