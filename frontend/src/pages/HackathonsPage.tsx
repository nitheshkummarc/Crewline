// Hackathon list: each hackathon with its team size rules and a link to its board.
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/Button';
import { EmptyState, LoadError, SkeletonRows } from '../components/LoadState';
import { useHackathons } from '../hooks/queries';

/** The home page for signed-in users. */
export default function HackathonsPage() {
  const hackathons = useHackathons();
  const list = hackathons.data ?? [];
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="page-title" className="page-title">Hackathons</h1>
        <p className="text-room-ink2">Pick a hackathon to see its teams with open seats and the people looking for one.</p>
      </div>
      {hackathons.isPending && <SkeletonRows rows={2} label="Loading hackathons" />}
      {hackathons.error && <LoadError error={hackathons.error} onRetry={() => void hackathons.refetch()} />}
      {hackathons.isSuccess && list.length === 0 && (
        <EmptyState title="No hackathons yet">Hackathons are added by the organizers. Check back once one is announced.</EmptyState>
      )}
      {list.length > 0 && (
        <ul className="divide-y divide-flap-seam overflow-hidden rounded-md bg-board text-paint">
          {list.map((hackathon, index) => (
            <li key={hackathon.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <Link to={`/h/${hackathon.id}`} className="cells text-[18px] leading-6 hover:underline">{hackathon.name}</Link>
                <span className="text-sm text-paint-2">
                  Teams of {hackathon.min_team_size} to {hackathon.max_team_size}. Invite codes last {hackathon.invite_ttl_hours} h.
                </span>
              </div>
              <ButtonLink to={`/h/${hackathon.id}`} variant={index === 0 ? 'primary' : 'board'}>
                Open board <ArrowRight size={16} aria-hidden="true" />
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
