-- 操作ログ機能を廃止（RLS ポリシーは CASCADE でまとめて削除）
DROP TABLE IF EXISTS activity_logs CASCADE;
