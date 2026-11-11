// Hackathon list: one card per hackathon in its band color, with team size rules and a link to its board.
import { ArrowRight, CalendarClock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/Button';
import { HeroBanner } from '../components/HeroBanner';
import { EmptyState, LoadError, SkeletonCards } from '../components/LoadState';
import { useHackathons, useMe } from '../hooks/queries';
import { bandStyle } from '../lib/teamColor';

/** The home page for signed-in users. */
export default function HackathonsPage() {
  const me = useMe();
  const hackathons = useHackathons();
  const list = hackathons.data ?? [];
  const firstName = me.data?.display_name.split(' ')[0];
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-8">
      <HeroBanner titleId="page-title" title="Hackathons">
        <p className="max-w-[52ch] text-shell-ink2">{firstName ? `Welcome, ${firstName}. ` : ''}Open a hackathon to see teams with open seats, the people looking for one, and everything that changes, live.</p>
      </HeroBanner>
      {hackathons.isPending && <SkeletonCards count={2} label="Loading hackathons" />}
      {hackathons.error && <LoadError error={hackathons.error} onRetry={() => void hackathons.refetch()} />}
      {hackathons.isSuccess && list.length === 0 && (
        <EmptyState title="No hackathons yet">Hackathons are added by the organizers. Check back once one is announced.</EmptyState>
      )}
      {list.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {list.map((hackathon, index) => (
            <li key={hackathon.id} style={bandStyle(hackathon.id)} className="card card-lift flex flex-col overflow-hidden">
              <div className="band-soft flex min-h-[132px] flex-col justify-end gap-2 p-6">
                <h2 className="display text-[26px] leading-8">
                  <Link to={`/h/${hackathon.id}`} className="hover:underline">{hackathon.name}</Link>
                </h2>
              </div>
              <div className="flex flex-1 flex-col gap-5 p-6">
                <ul className="flex flex-col gap-2 text-ink-2">
                  <li className="flex items-center gap-2"><Users size={16} aria-hidden="true" />Teams of {hackathon.min_team_size} to {hackathon.max_team_size} people</li>
                  <li className="flex items-center gap-2"><CalendarClock size={16} aria-hidden="true" />Invite codes last {hackathon.invite_ttl_hours} hours</li>
                </ul>
                <ButtonLink to={`/h/${hackathon.id}`} variant={index === 0 ? 'primary' : 'secondary'} className="mt-auto self-start">
                  Open board <ArrowRight size={16} aria-hidden="true" />
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
