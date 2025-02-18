'use strict';

function getAllEncountersOfType(params, encounterType, cutoffDate, filterQuery) {
    return params.db.objects('ProgramEncounter')
        .filtered(`voided == false 
                    AND encounterType.name == $0
                    AND voided == false 
                    AND programEnrolment.individual.voided == false 
                    AND programEnrolment.voided == false 
                    AND programEnrolment.programExitDateTime == null
                    AND programEnrolment.enrolmentDateTime > $1
                    AND ${filterQuery}`, encounterType, cutoffDate);
}

function getAllEncountersOfType_DependentOnAnotherEncounterType(params, encounterType1, encounterType2, cutoffDate, filterQuery) {
    return params.db.objects('ProgramEncounter')
        .filtered(`voided == false 
                    AND (encounterType.name == $0 or encounterType.name == $1)
                    AND voided == false 
                    AND programEnrolment.individual.voided == false 
                    AND programEnrolment.voided == false 
                    AND programEnrolment.programExitDateTime == null
                    AND programEnrolment.enrolmentDateTime > $2
                    AND ${filterQuery}`, encounterType1, encounterType2, cutoffDate);
}

function hasIncompleteEncounters(encounters, imports, schedule, enrolmentBaseDateConcept, observation) {
    if (encounters.length >= schedule.length) return false;
    if(observation && !observationEligibilityCheck(encounters, observation)) return false;
    const baseDate = getBaseDate(encounters[0].programEnrolment, enrolmentBaseDateConcept);
    const daysBetween = imports.moment(new Date()).diff(imports.moment(baseDate), 'days');
    const day = schedule[encounters.length];
    return day.min <= daysBetween && day.max > daysBetween;
}

function hasIncompleteEncounters_BasedOnAnotherEncounterTypeObs(encounters, imports, schedule, encounterTypeName, dateConceptName, dateEncounterTypeName, observation){
    const dateEncounters = encounters.filter(enc => enc.encounterType.name == dateEncounterTypeName);
    if(dateEncounters.length == 0) return false;
    
    const baseDate = getBaseDate(dateEncounters[0], dateConceptName);
    const daysBetween = imports.moment(new Date()).diff(imports.moment(baseDate), 'days');
    
    const targetEncounters = encounters.filter(enc => enc.encounterType.name == encounterTypeName);
    if(targetEncounters.length == 0) return schedule[0].min <= daysBetween && schedule[0].max > daysBetween;
    if(observation && !observationEligibilityCheck(targetEncounters, observation)) return false;
    if (targetEncounters.length >= schedule.length) return false;
    
    const day = schedule[targetEncounters.length];
    return day.min <= daysBetween && day.max > daysBetween;
}

function observationEligibilityCheck(encounters, observation){
    return encounters.some((enc) => {
        return enc.observation.some((obs) => {
            const valueJSON = JSON.parse(obs.valueJSON);
            return obs.concept.uuid == observation.uuid && 
                (Array.isArray(observation.answer) ? Array.isArray(valueJSON.answer) && observation.answer.some(ans => valueJSON.answer.includes(ans)) : valueJSON.answer == observation.answer);
        })
    })
}

function enrolmentHasDueEncounter(enrolment, imports, schedule, enrolmentBaseDateConcept) {
    const baseDate = getBaseDate(enrolment, enrolmentBaseDateConcept);
    const daysBetween = imports.moment(new Date()).diff(imports.moment(baseDate), 'days');
    return schedule[0].min <= daysBetween && schedule[0].max > daysBetween;
}

function getBaseDate(entity, baseDateConcept) {
    return entity.getObservationValue(baseDateConcept);
}

function getEnrolmentsWithNoEncounterOfType(params, encounterType, programName, filterQuery) {
    return params.db.objects('ProgramEnrolment')
        .filtered(`voided == false 
                    AND program.name == $0 
                    AND individual.voided == false 
                    AND programExitDateTime == null
                    AND subquery(encounters, $encounter, 
                        $encounter.encounterType.name == $1 
                        AND $encounter.voided == false
                    ).@count == 0
                    AND ${filterQuery}`, programName, encounterType);
}

() => {
    function getIndividualsNotPerSchedule_BasedOnEnrolmentObs(params, imports, {
        schedule,
        programName,
        encounterType,
        dateConceptName,
        cutoffMonths,
        genderValues,
        addressValues,
        observation
    }) {
        const cutoffDate = imports.moment(new Date()).subtract(cutoffMonths, 'months').toDate();

        let encounterFilterQuery = ` voided = false `;
        let enrolmentFilterQuery = ` voided = false `;
        if(genderValues && genderValues.length > 0){
            const output = `{${genderValues.map(item => `'${item}'`).join(', ')}}`;
            encounterFilterQuery = ` programEnrolment.individual.gender.uuid IN ${output} `;
            enrolmentFilterQuery = ` individual.gender.uuid IN ${output} `
        }
        if(addressValues && addressValues.length > 0){
            const output = `{${addressValues.map(item => `'${item}'`).join(', ')}}`;
            encounterFilterQuery += `AND programEnrolment.individual.lowestAddressLevel.uuid IN ${output} `;
            enrolmentFilterQuery += `AND individual.lowestAddressLevel.uuid IN ${output} `
        }

        const encounters = getAllEncountersOfType(params, encounterType, cutoffDate, encounterFilterQuery);
        const enrolmentEncounters = imports.lodash.groupBy(encounters, 'programEnrolment.uuid');
        const individuals = Object.keys(enrolmentEncounters)
            .filter(enrolmentUuid => hasIncompleteEncounters(enrolmentEncounters[enrolmentUuid], imports, schedule, dateConceptName, observation))
            .map(enrolmentUuid => enrolmentEncounters[enrolmentUuid][0].programEnrolment.individual);

        const noEncounterEnrolments = getEnrolmentsWithNoEncounterOfType(params, encounterType, programName, enrolmentFilterQuery)
            .filter((enrolment) => enrolmentHasDueEncounter(enrolment, imports, schedule, dateConceptName));

        return individuals.concat(noEncounterEnrolments.map(enrolment => enrolment.individual));
    }

    function getIndividualsNotPerSchedule_BasedOnAnotherEncounterTypeObs(params, imports,
                                                                         {
                                                                             schedule,
                                                                             encounterTypeName,
                                                                             dateConceptName,
                                                                             dateEncounterTypeName,
                                                                             cutoffMonths,
                                                                             genderValues,
                                                                             addressValues,
                                                                             observation
                                                                         }) {
        const cutoffDate = imports.moment(new Date()).subtract(cutoffMonths, 'months').toDate();

        let filterQuery = ` voided = false `;
        if(genderValues && genderValues.length > 0){
            const output = `{${genderValues.map(item => `'${item}'`).join(', ')}}`;
            filterQuery = ` programEnrolment.individual.gender.uuid IN ${output} `;
        }
        if(addressValues && addressValues.length > 0){
            const output = `{${addressValues.map(item => `'${item}'`).join(', ')}}`;
            filterQuery += `AND programEnrolment.individual.lowestAddressLevel.uuid IN ${output} `;
        }

        const encounters = getAllEncountersOfType_DependentOnAnotherEncounterType(params, encounterTypeName, dateEncounterTypeName, cutoffDate, filterQuery);
        const groupedEncounters = imports.lodash.groupBy(encounters, 'programEnrolment.uuid');
        const individuals = Object.keys(groupedEncounters)
            .filter(enrolmentUuid => hasIncompleteEncounters_BasedOnAnotherEncounterTypeObs(groupedEncounters[enrolmentUuid], imports, schedule, encounterTypeName, dateConceptName, dateEncounterTypeName, observation))
            .map(enrolmentUuid => groupedEncounters[enrolmentUuid][0].programEnrolment.individual);
        return individuals;
    }

    return {
        getIndividualsNotPerSchedule_BasedOnEnrolmentObs: getIndividualsNotPerSchedule_BasedOnEnrolmentObs,
        getIndividualsNotPerSchedule_BasedOnAnotherEncounterTypeObs: getIndividualsNotPerSchedule_BasedOnAnotherEncounterTypeObs
    }
};
