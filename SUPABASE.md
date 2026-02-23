# Supabase でデータを複数デバイスで共有する

環境変数に Supabase の URL と Anon Key を設定すると、名簿・レッスン・スケジュールが Supabase に保存され、**どのデバイスから開いても同じデータ**が表示されます。

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
