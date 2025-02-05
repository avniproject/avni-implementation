'use strict';

function getAllEncountersOfType(params, encounterType, cutoffDate) {
    return params.db.objects('ProgramEncounter')
        .filtered(`voided == false 
                    AND encounterType.name == $0
                    AND voided == false 
                    AND programEnrolment.individual.voided == false 
                    AND programEnrolment.voided == false 
                    AND programEnrolment.programExitDateTime == null
                    AND programEnrolment.enrolmentDateTime > $1`, encounterType, cutoffDate);
}

function getAllEncountersOfType_DependentOnAnotherEncounterType(params, encounterType1, encounterType2, cutoffDate) {
    return params.db.objects('ProgramEncounter')
        .filtered(`voided == false 
                    AND (encounterType.name == $0 or encounterType.name == $1)
                    AND voided == false 
                    AND programEnrolment.individual.voided == false 
                    AND programEnrolment.voided == false 
                    AND programEnrolment.programExitDateTime == null
                    AND subquery(encounters, $encounter, 
                                    $encounter.encounterType.name == $1 AND $encounter.voided == false).@count == 1
                    AND programEnrolment.enrolmentDateTime > $1`, encounterType1, encounterType2, cutoffDate);
}

function hasIncompleteEncounters(encounters, imports, schedule, enrolmentBaseDateConcept) {
    if (encounters.length >= schedule.length) return false;
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

function getEnrolmentsWithNoEncounterOfType(params, encounterType, programName) {
    return params.db.objects('ProgramEnrolment')
        .filtered(`voided == false 
                    AND program.name == $0 
                    AND individual.voided == false 
                    AND programExitDateTime == null
                    AND subquery(encounters, $encounter, 
                                    $encounter.encounterType.name == $1 AND $encounter.voided == false).@count == 0`, programName, encounterType);
}

function getEnrolmentsWithNoEncounterOfAType_WithAnotherEncounterType(params, programName, encounterTypeName, dateEncounterTypeName) {
    return params.db.objects('ProgramEnrolment')
        .filtered(`voided == false 
                    AND program.name == $0 
                    AND individual.voided == false 
                    AND programExitDateTime == null
                    AND subquery(encounters, $encounter, 
                                    $encounter.encounterType.name == $1 AND $encounter.voided == false).@count == 0
                    AND subquery(encounters, $encounter, 
                                    $encounter.encounterType.name == $2 AND $encounter.voided == false).@count == 1`,
                                                    programName, encounterTypeName, dateEncounterTypeName);
}

() => {
    function getIndividualsNotPerSchedule_BasedOnEnrolmentObs(params, imports, {
        schedule,
        programName,
        encounterType,
        dateConceptName,
        cutoffMonths
    }) {
        const cutoffDate = imports.moment(new Date()).subtract(cutoffMonths, 'months').toDate();
        const encounters = getAllEncountersOfType(params, encounterType, cutoffDate);
        const enrolmentEncounters = imports.lodash.groupBy(encounters, 'programEnrolment.uuid');
        const individuals = Object.keys(enrolmentEncounters)
            .filter(enrolmentUuid => hasIncompleteEncounters(enrolmentEncounters[enrolmentUuid], imports, schedule, dateConceptName))
            .map(enrolmentUuid => enrolmentEncounters[enrolmentUuid][0].programEnrolment.individual);

        const noEncounterEnrolments = getEnrolmentsWithNoEncounterOfType(params, encounterType, programName)
            .filter((enrolment) => enrolmentHasDueEncounter(enrolment, imports, schedule, dateConceptName));

        return individuals.concat(noEncounterEnrolments.map(enrolment => enrolment.individual));
    }

    function getIndividualsNotPerSchedule_BasedOnAnotherEncounterTypeObs(params, imports,
                                                                         {
                                                                             schedule,
                                                                             encounterTypeName,
                                                                             dateConceptName,
                                                                             dateEncounterTypeName,
                                                                             cutoffMonths
                                                                         }) {
        const encounters = getAllEncountersOfType_DependentOnAnotherEncounterType(params, encounterTypeName, dateEncounterTypeName, cutoffMonths);
        const groupedEncounters = imports.lodash.groupBy(encounters, 'programEnrolment.uuid');

        getEnrolmentsWithNoEncounterOfAType_WithAnotherEncounterType();
    }

    return {
        getIndividualsNotPerSchedule_BasedOnEnrolmentObs: getIndividualsNotPerSchedule_BasedOnEnrolmentObs
    }
};
