import type {
	Application,
	CreateApplicationInput,
	UpdateApplicationInput,
} from './application.js';
import type { ActorRef } from './actor.js';
import type {
	CreateLandscapeEnvironmentInput,
	LandscapeEnvironment,
	UpdateLandscapeEnvironmentInput,
} from './landscape-environment.js';
import type {
	CreateLandscapeInput,
	Landscape,
	UpdateLandscapeInput,
} from './landscape.js';
import type {
	CreateHostingProviderInput,
	HostingProvider,
	UpdateHostingProviderInput,
} from './hosting-provider.js';
import type {
	CreateResourceInput,
	Resource,
	UpdateResourceInput,
} from './resource.js';

export type ListFilter = {
	includeInactive: boolean;
};

export interface ApplicationRepository {
	list(filter: ListFilter): Promise<Application[]>;
	findById(id: string): Promise<Application | null>;
	create(
		input: CreateApplicationInput,
		actor: ActorRef,
	): Promise<Application>;
	update(
		id: string,
		patch: UpdateApplicationInput,
		actor: ActorRef,
	): Promise<Application | null>;
	softDelete(id: string, actor: ActorRef): Promise<boolean>;
}

export interface LandscapeRepository {
	list(filter: ListFilter): Promise<Landscape[]>;
	findById(id: string): Promise<Landscape | null>;
	create(input: CreateLandscapeInput, actor: ActorRef): Promise<Landscape>;
	update(
		id: string,
		patch: UpdateLandscapeInput,
		actor: ActorRef,
	): Promise<Landscape | null>;
	softDelete(id: string, actor: ActorRef): Promise<boolean>;
}

export interface LandscapeEnvironmentRepository {
	list(
		filter: ListFilter & { landscapeId?: string },
	): Promise<LandscapeEnvironment[]>;
	findById(id: string): Promise<LandscapeEnvironment | null>;
	create(
		input: CreateLandscapeEnvironmentInput,
		actor: ActorRef,
	): Promise<LandscapeEnvironment>;
	update(
		id: string,
		patch: UpdateLandscapeEnvironmentInput,
		actor: ActorRef,
	): Promise<LandscapeEnvironment | null>;
	softDelete(id: string, actor: ActorRef): Promise<boolean>;
}

export interface ResourceRepository {
	list(
		filter: ListFilter & {
			landscapeId?: string;
			landscapeEnvironmentId?: string;
			applicationId?: string;
		},
	): Promise<Resource[]>;
	findById(id: string): Promise<Resource | null>;
	create(input: CreateResourceInput, actor: ActorRef): Promise<Resource>;
	update(
		id: string,
		patch: UpdateResourceInput,
		actor: ActorRef,
	): Promise<Resource | null>;
	softDelete(id: string, actor: ActorRef): Promise<boolean>;
}

export interface HostingProviderRepository {
	list(filter: ListFilter): Promise<HostingProvider[]>;
	findById(id: string): Promise<HostingProvider | null>;
	findByCode(code: string): Promise<HostingProvider | null>;
	countEnvironmentsUsingCode(code: string): Promise<number>;
	create(
		input: CreateHostingProviderInput,
		actor: ActorRef,
	): Promise<HostingProvider>;
	update(
		id: string,
		patch: UpdateHostingProviderInput,
		actor: ActorRef,
	): Promise<HostingProvider | null>;
	softDelete(id: string, actor: ActorRef): Promise<boolean>;
}
