-- Create table for user agenda
CREATE TABLE IF NOT EXISTS user_agenda_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    title text NOT NULL,
    description text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    is_all_day boolean DEFAULT false,
    category text DEFAULT 'meeting', -- 'meeting', 'deadline', 'personal', 'site_visit'
    created_at timestamp with time zone DEFAULT now(),
    reminder_sent boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE user_agenda_events ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see and manage ONLY their own events
CREATE POLICY "Users can manage their own agenda" ON user_agenda_events
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_agenda_user_time ON user_agenda_events(user_id, start_time);
