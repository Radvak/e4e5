/** Lichess studies (@e4e5/data lichessStudies.ts) with the server's addresses, User-Agent and lichess.org queue. */
import { clearStudyCache, getStudy as sharedGetStudy, StudyError, studiesBy as sharedStudiesBy, type StudyDetail, type StudyListItem } from '@e4e5/data';
import { gameSources } from './gameSources.js';

export { clearStudyCache, StudyError, type StudyDetail, type StudyListItem };

/** With the user's Lichess token (if linked): their private studies too. */
export const studiesBy = (username: string, token?: string | null): Promise<StudyListItem[]> => sharedStudiesBy(gameSources(token), username);
export const getStudy = (id: string, token?: string | null): Promise<StudyDetail> => sharedGetStudy(gameSources(token), id);
