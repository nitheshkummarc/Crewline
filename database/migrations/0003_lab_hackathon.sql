-- Race lab: one hidden hackathon that holds the lab's experiments, so they never touch a real event's board.
ALTER TABLE hackathons ADD COLUMN is_lab boolean NOT NULL DEFAULT false;

-- At most one lab hackathon; concurrent lab runs that create it race on this index and the loser reads the winner's row.
CREATE UNIQUE INDEX hackathons_one_lab ON hackathons (is_lab) WHERE is_lab;
