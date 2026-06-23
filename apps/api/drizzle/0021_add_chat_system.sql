-- Chat System Tables for ClawNode Proxmox Backend
-- Adapted from synex-fork to use agents schema

-- Chats table: tracks conversation threads per agent
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX chats_agent_id_idx ON chats(agent_id);
CREATE INDEX chats_user_id_idx ON chats(user_id);
CREATE INDEX chats_is_active_idx ON chats(is_active);

-- Chat Messages table: stores individual messages in a chat
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL, -- 'user' or 'agent' or 'system'
    sender_id TEXT, -- userId or agentId depending on sender_type
    content TEXT NOT NULL,
    metadata JSONB, -- for attachments, rich formatting, etc.
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX chat_messages_chat_id_idx ON chat_messages(chat_id);
CREATE INDEX chat_messages_sender_type_idx ON chat_messages(sender_type);
CREATE INDEX chat_messages_sent_at_idx ON chat_messages(sent_at);

-- Telegram Integration table: links agents to Telegram webhooks
CREATE TABLE IF NOT EXISTS telegram_webhooks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    agent_id TEXT NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
    telegram_chat_id TEXT,
    telegram_user_id TEXT,
    bot_token TEXT NOT NULL, -- encrypted at rest
    webhook_secret TEXT NOT NULL, -- for verifying webhook signatures
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX telegram_webhooks_agent_id_idx ON telegram_webhooks(agent_id);
CREATE INDEX telegram_webhooks_is_active_idx ON telegram_webhooks(is_active);
