/** Lichess studies (@tabiya/data lichessStudies.ts) with the server's addresses, User-Agent and lichess.org queue. */
import { clearStudyCache, getStudy as sharedGetStudy, StudyError, studiesBy as sharedStudiesBy, type StudyDetail, type StudyListItem } from '@tabiya/data';
import { gameSources } from './gameSources.js';

export { clearStudyCache, StudyError, type StudyDetail, type StudyListItem };

export const studiesBy = (username: string): Promise<StudyListItem[]> => sharedStudiesBy(gameSources(null), username);
export const getStudy = (id: string): Promise<StudyDetail> => sharedGetStudy(gameSources(null), id);
