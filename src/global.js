'use strict';
() => {
    function hasIncompleteEncounters(encounters, imports, schedule, enrolmentBaseDateConcept) {
        if(encounters.length >= schedule.length) return false;
        const baseDate = getBaseDate(encounters[0].programEnrolment, enrolmentBaseDateConcept);
        const daysBetween = imports.moment(new Date()).diff(imports.moment(baseDate), 'days');
        const day = schedule[encounters.length];
        return day.min <= daysBetween && day.max > daysBetween;
    }

    function enrolmentHasDueEncounter(enrolment, imports, schedule, enrolmentBaseDateConcept) {
        const baseDate = getBaseDate(enrolment, enrolmentBaseDateConcept);
        const daysBetween = imports.moment(new Date()).diff(imports.moment(baseDate), 'days');
        return schedule[0].min <= daysBetween && schedule[0].max > daysBetween;
    }

    function getBaseDate(enl, enrolmentBaseDateConcept) {
        return enl.getObservationValue(enrolmentBaseDateConcept);
    }

    // schedule: [number] e.g. [150, 210, 240, 255, 270]
    // encounterType: string e.g. 'ANC - Saheli'
    // enrolmentBaseDateConcept: string. e.g. 'Last menstrual period'
    // cutoffMonths: number. e.g. 18, number of months after which the enrolment will not be counted
    function getIndividualsNotPerSchedule(params, imports, schedule, encounterType, enrolmentBaseDateConcept, cutoffMonths) {
        const cutoffDate = imports.moment(new Date()).subtract(cutoffMonths, 'months').toDate();
        const encounters = params.db.objects('ProgramEncounter')
            .filtered(`voided == false 
                    AND encounterType.name == $0
                    AND voided == false 
                    AND programEnrolment.individual.voided == false 
                    AND programEnrolment.voided == false 
                    AND programEnrolment.programExitDateTime == null
                    AND programEnrolment.enrolmentDateTime > $1`, encounterType, cutoffDate);
        const enrolmentEncounters = imports.lodash.groupBy(encounters, 'programEnrolment.uuid');
        const individuals = Object.keys(enrolmentEncounters)
            .filter(enrolmentUuid => hasIncompleteEncounters(enrolmentEncounters[enrolmentUuid], imports, schedule, enrolmentBaseDateConcept))
            .map(enrolmentUuid => enrolmentEncounters[enrolmentUuid][0].programEnrolment.individual);

        const noEncounterEnrolments = params.db.objects('ProgramEnrolment')
            .filtered(`voided == false 
                    AND program.name == 'Pregnancy' 
                    AND individual.voided == false 
                    AND programExitDateTime == null
                    AND subquery(encounters, $encounter, 
                                    $encounter.encounterType.name == $0 AND $encounter.voided == false).@count == 0`, encounterType)
            .filter((enrolment) => enrolmentHasDueEncounter(enrolment, imports, schedule, enrolmentBaseDateConcept));

        return individuals.concat(noEncounterEnrolments.map(enrolment => enrolment.individual));
    }

    return {
        getIndividualsNotPerSchedule: getIndividualsNotPerSchedule
    }
};
