import {DataLoader, DropDown, DropDownMenu, MenuItem, Tooltip} from 'argo-ui';
import * as PropTypes from 'prop-types';
import * as React from 'react';
import Moment from 'react-moment';

import {AppContext} from '../../../shared/context';
import {EmptyState} from '../../../shared/components';
import {Application, ApplicationTree, HostResourceInfo, InfoItem, Node, Pod, ResourceName, ResourceNode, ResourceStatus} from '../../../shared/models';
import {PodViewPreferences, services, ViewPreferences} from '../../../shared/services';

import {ResourceTreeNode} from '../application-resource-tree/application-resource-tree';
import {ResourceIcon} from '../resource-icon';
import {ResourceLabel} from '../resource-label';
import {ComparisonStatusIcon, isYoungerThanXMinutes, HealthStatusIcon, nodeKey, PodHealthIcon} from '../utils';

import './pod-view.scss';
import {PodTooltip} from './pod-tooltip';

interface PodViewProps {
    tree: ApplicationTree;
    onItemClick: (fullName: string) => void;
    app: Application;
    nodeMenu?: (node: ResourceNode) => React.ReactNode;
    quickStarts?: (node: ResourceNode) => React.ReactNode;
}

export type PodGroupType = 'topLevelResource' | 'parentResource' | 'node';
export type SortOrder = 'asc' | 'desc';

const labelForSortOrder: Record<SortOrder, string> = {
    asc: 'Oldest First',
    desc: 'Newest First'
};

export interface PodGroup extends Partial<ResourceNode> {
    timestamp?: number;
    type: PodGroupType;
    pods: Pod[];
    info?: InfoItem[];
    hostResourcesInfo?: HostResourceInfo[];
    resourceStatus?: Partial<ResourceStatus>;
    renderMenu?: () => React.ReactNode;
    renderQuickStarts?: () => React.ReactNode;
    fullName?: string;
    hostLabels?: {[name: string]: string};
}

export class PodView extends React.Component<PodViewProps> {
    private get appContext(): AppContext {
        return this.context as AppContext;
    }

    public static contextTypes = {
        apis: PropTypes.object
    };

    public render() {
        return (
            <DataLoader load={() => services.viewPreferences.getPreferences()}>
                {prefs => {
                    const podPrefs = prefs.appDetails.podView || ({} as PodViewPreferences);
                    const groups = this.processTree(podPrefs.sortMode, this.props.tree.hosts || []) || [];

                    if (podPrefs.sortMode !== 'node' && podPrefs.sortOrder) {
                        // Sort the groups in place based on precomputed timestamps
                        groups.sort((a, b) => {
                            const timeA = Date.parse(a.createdAt || '0');
                            const timeB = Date.parse(b.createdAt || '0');
                            a.timestamp = timeA;
                            b.timestamp = timeB;

                            return podPrefs.sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
                        });
                    }

                    return (
                        <React.Fragment>
                            <div className='pod-view__settings'>
                                <div className='pod-view__settings__section'>
                                    GROUP BY:&nbsp;
                                    <DropDownMenu
                                        anchor={() => (
                                            <button className='argo-button argo-button--base-o'>
                                                {labelForSortMode[podPrefs.sortMode]}&nbsp;&nbsp;
                                                <i className='fa fa-chevron-circle-down' />
                                            </button>
                                        )}
                                        items={this.menuItemsFor(['node', 'parentResource', 'topLevelResource'], prefs)}
                                    />
                                </div>
                                {podPrefs.sortMode !== 'node' && (
                                    <div className='pod-view__settings__section'>
                                        SORT BY AGE:&nbsp;
                                        <DropDownMenu
                                            anchor={() => (
                                                <button className='argo-button argo-button--base-o'>
                                                    {labelForSortOrder[podPrefs.sortOrder || 'desc']}&nbsp;&nbsp;
                                                    <i className='fa fa-chevron-circle-down' />
                                                </button>
                                            )}
                                            items={this.sortOrderItemsFor(['asc', 'desc'], prefs)}
                                        />
                                    </div>
                                )}
                                {podPrefs.sortMode === 'node' && (
                                    <div className='pod-view__settings__section'>
                                        <button
                                            className={`argo-button argo-button--base${podPrefs.hideUnschedulable ? '-o' : ''}`}
                                            style={{border: 'none', width: '170px'}}
                                            onClick={() =>
                                                services.viewPreferences.updatePreferences({
                                                    appDetails: {...prefs.appDetails, podView: {...podPrefs, hideUnschedulable: !podPrefs.hideUnschedulable}}
                                                })
                                            }>
                                            <i className={`fa fa-${podPrefs.hideUnschedulable ? 'eye-slash' : 'eye'}`} style={{width: '15px', marginRight: '5px'}} />
                                            UNSCHEDULABLE
                                        </button>
                                    </div>
                                )}
                            </div>
                            {groups.length > 0 ? (
                                <div className='pod-view__nodes-container'>
                                    {groups.map(group => {
                                        if (group.type === 'node' && group.name === 'Unschedulable' && podPrefs.hideUnschedulable) {
                                            return null;
                                        }
                                        return (
                                            <div className={`pod-view__node white-box ${group.kind === 'node' && 'pod-view__node--large'}`} key={group.fullName || group.name}>
                                                <div
                                                    className='pod-view__node__container--header'
                                                    onClick={() => this.props.onItemClick(group.fullName)}
                                                    style={group.kind === 'node' ? {} : {cursor: 'pointer'}}>
                                                    <div style={{display: 'flex', alignItems: 'center'}}>
                                                        <div style={{marginRight: '10px'}}>
                                                            <ResourceIcon kind={group.kind || 'Unknown'} />
                                                            <br />
                                                            {<div style={{textAlign: 'center'}}>{ResourceLabel({kind: group.kind})}</div>}
                                                        </div>
                                                        <div style={{lineHeight: '15px'}}>
                                                            <b style={{wordWrap: 'break-word'}}>{group.name || 'Unknown'}</b>
                                                            {group.resourceStatus && (
                                                                <div>
                                                                    {group.resourceStatus.health && <HealthStatusIcon state={group.resourceStatus.health} />}
                                                                    &nbsp;
                                                                    {group.resourceStatus.status && (
                                                                        <ComparisonStatusIcon status={group.resourceStatus.status} resource={group.resourceStatus} />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{marginLeft: 'auto'}}>
                                                            {group.renderMenu && (
                                                                <DropDown
                                                                    isMenu={true}
                                                                    anchor={() => (
                                                                        <button className='argo-button argo-button--light argo-button--lg argo-button--short'>
                                                                            <i className='fa fa-ellipsis-v' />
                                                                        </button>
                                                                    )}>
                                                                    {() => group.renderMenu()}
                                                                </DropDown>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {group.type === 'node' ? (
                                                        <div>
                                                            <div className='pod-view__node__info--large'>
                                                                {(group.info || []).map(item => (
                                                                    <Tooltip content={`${item.name}: ${item.value}`} key={item.name}>
                                                                        <div className='pod-view__node__info--large__item'>
                                                                            <div className='pod-view__node__info--large__item__name'>{item.name}:</div>
                                                                            <div className='pod-view__node__info--large__item__value'>{item.value}</div>
                                                                        </div>
                                                                    </Tooltip>
                                                                ))}
                                                            </div>
                                                            {group.hostLabels && Object.keys(group.hostLabels).length > 0 ? (
                                                                <div className='pod-view__node__info--large'>
                                                                    {Object.keys(group.hostLabels || []).map(label => (
                                                                        <Tooltip content={`${label}: ${group.hostLabels[label]}`} key={label}>
                                                                            <div className='pod-view__node__info--large__item'>
                                                                                <div className='pod-view__node__info--large__item__name'>{label}:</div>
                                                                                <div className='pod-view__node__info--large__item__value'>{group.hostLabels[label]}</div>
                                                                            </div>
                                                                        </Tooltip>
                                                                    ))}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ) : (
                                                        <div className='pod-view__node__info'>
                                                            {group.createdAt ? (
                                                                <div>
                                                                    <Moment fromNow={true} ago={true}>
                                                                        {group.createdAt}
                                                                    </Moment>
                                                                </div>
                                                            ) : null}
                                                            {group.info?.map(infoItem => <div key={infoItem.name}>{infoItem.value}</div>)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className='pod-view__node__container'>
                                                    {(group.hostResourcesInfo || []).length > 0 && (
                                                        <div className='pod-view__node__container pod-view__node__container--stats'>
                                                            {group.hostResourcesInfo.map(info => renderStats(info))}
                                                        </div>
                                                    )}
                                                    <div className='pod-view__node__pod-container pod-view__node__container'>
                                                        <div className='pod-view__node__pod-container__pods'>
                                                            {group.pods.map(
                                                                pod =>
                                                                    this.props.nodeMenu && (
                                                                        <DropDown
                                                                            key={pod.uid}
                                                                            isMenu={true}
                                                                            anchor={() => (
                                                                                <Tooltip
                                                                                    content={<PodTooltip pod={pod} />}
                                                                                    popperOptions={{
                                                                                        modifiers: {
                                                                                            preventOverflow: {
                                                                                                enabled: true
                                                                                            },
                                                                                            hide: {
                                                                                                enabled: false
                                                                                            },
                                                                                            flip: {
                                                                                                enabled: false
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    key={pod.metadata.name}>
                                                                                    <div style={{position: 'relative'}}>
                                                                                        {isYoungerThanXMinutes(pod, 30) && (
                                                                                            <i className='fas fa-circle pod-view__node__pod pod-view__node__pod__new-pod-icon' />
                                                                                        )}
                                                                                        <div className={`pod-view__node__pod pod-view__node__pod--${pod.health.toLowerCase()}`}>
                                                                                            <PodHealthIcon state={{status: pod.health, message: ''}} />
                                                                                        </div>
                                                                                    </div>
                                                                                </Tooltip>
                                                                            )}>
                                                                            {() => this.props.nodeMenu(pod)}
                                                                        </DropDown>
                                                                    )
                                                            )}
                                                        </div>
                                                        <div className='pod-view__node__label'>PODS</div>
                                                        {(podPrefs.sortMode === 'parentResource' || podPrefs.sortMode === 'topLevelResource') && (
                                                            <div key={group.uid}>{group.renderQuickStarts()}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyState icon=' fa fa-th'>
                                    <h4>Your application has no pod groups</h4>
                                    <h5>Try switching to tree or list view</h5>
                                </EmptyState>
                            )}
                        </React.Fragment>
                    );
                }}
            </DataLoader>
        );
    }

    private sortOrderItemsFor(orders: SortOrder[], prefs: ViewPreferences): MenuItem[] {
        const podPrefs = prefs.appDetails.podView || ({} as PodViewPreferences);
        return orders.map(order => ({
            title: (
                <React.Fragment>
                    {podPrefs.sortOrder === order && <i className='fa fa-check' />} {labelForSortOrder[order]}{' '}
                </React.Fragment>
            ),
            action: () => {
                this.appContext.apis.navigation.goto('.', {podSortOrder: order});
                services.viewPreferences.updatePreferences({
                    appDetails: {
                        ...prefs.appDetails,
                        podView: {...podPrefs, sortOrder: order}
                    }
                });
            }
        }));
    }

    private menuItemsFor(modes: PodGroupType[], prefs: ViewPreferences): MenuItem[] {
        const podPrefs = prefs.appDetails.podView || ({} as PodViewPreferences);
        return modes.map(mode => ({
            title: (
                <React.Fragment>
                    {podPrefs.sortMode === mode && <i className='fa fa-check' />} {labelForSortMode[mode]}{' '}
                </React.Fragment>
            ),
            action: () => {
                this.appContext.apis.navigation.goto('.', {podSortMode: mode});
                services.viewPreferences.updatePreferences({appDetails: {...prefs.appDetails, podView: {...podPrefs, sortMode: mode}}});
            }
        }));
    }

    private processTree(sortMode: PodGroupType, initNodes: Node[]): PodGroup[] {
        const tree = this.props.tree;
        if (!tree) {
            return [];
        }
        const groupRefs: {[key: string]: PodGroup} = {};
        const parentsFor: {[key: string]: PodGroup[]} = {};

        if (sortMode === 'node' && initNodes) {
            initNodes.forEach(infraNode => {
                const nodeName = infraNode.name;
                groupRefs[nodeName] = {
                    ...infraNode,
                    type: 'node',
                    kind: 'node',
                    name: nodeName,
                    pods: [],
                    info: [
                        {name: 'Kernel Version', value: infraNode.systemInfo.kernelVersion},
                        {name: 'OS/Arch', value: `${infraNode.systemInfo.operatingSystem}/${infraNode.systemInfo.architecture}`}
                    ],
                    hostResourcesInfo: infraNode.resourcesInfo,
                    hostLabels: infraNode.labels
                };
            });
        }

        const statusByKey = new Map<string, ResourceStatus>();
        this.props.app.status?.resources?.forEach(res => statusByKey.set(nodeKey(res), res));

        (tree.nodes || []).forEach((rnode: ResourceTreeNode) => {
            // make sure each node has not null/undefined parentRefs field
            rnode.parentRefs = rnode.parentRefs || [];

            if (sortMode !== 'node') {
                parentsFor[rnode.uid] = rnode.parentRefs as PodGroup[];
                const fullName = nodeKey(rnode);
                const status = statusByKey.get(fullName);

                if ((rnode.parentRefs || []).length === 0) {
                    rnode.root = rnode;
                }
                groupRefs[rnode.uid] = {
                    pods: [] as Pod[],
                    fullName,
                    ...groupRefs[rnode.uid],
                    ...rnode,
                    info: (rnode.info || []).filter(i => !i.name.includes('Resource.')),
                    createdAt: rnode.createdAt,
                    resourceStatus: {health: rnode.health, status: status ? status.status : null, requiresPruning: status && status.requiresPruning ? true : false},
                    renderMenu: () => this.props.nodeMenu(rnode),
                    renderQuickStarts: () => this.props.quickStarts(rnode)
                };
            }
        });
        (tree.nodes || []).forEach((rnode: ResourceTreeNode) => {
            if (rnode.kind !== 'Pod') {
                return;
            }

            const p: Pod = {
                ...rnode,
                fullName: nodeKey(rnode),
                metadata: {name: rnode.name},
                spec: {nodeName: 'Unknown'},
                health: rnode.health ? rnode.health.status : 'Unknown'
            } as Pod;

            // Get node name for Pod
            rnode.info?.forEach(i => {
                if (i.name === 'Node') {
                    p.spec.nodeName = i.value;
                }
            });

            if (sortMode === 'node') {
                if (groupRefs[p.spec.nodeName]) {
                    const curNode = groupRefs[p.spec.nodeName];
                    curNode.pods.push(p);
                } else {
                    if (groupRefs.Unschedulable) {
                        groupRefs.Unschedulable.pods.push(p);
                    } else {
                        groupRefs.Unschedulable = {
                            type: 'node',
                            kind: 'node',
                            name: 'Unschedulable',
                            pods: [p],
                            info: [
                                {name: 'Kernel Version', value: 'N/A'},
                                {name: 'OS/Arch', value: 'N/A'}
                            ],
                            hostResourcesInfo: [],
                            hostLabels: {}
                        };
                    }
                }
            } else if (sortMode === 'parentResource') {
                rnode.parentRefs.forEach(parentRef => {
                    if (!groupRefs[parentRef.uid]) {
                        groupRefs[parentRef.uid] = {
                            kind: parentRef.kind,
                            type: sortMode,
                            name: parentRef.name,
                            pods: [p]
                        };
                    } else {
                        groupRefs[parentRef.uid].pods.push(p);
                    }
                });
            } else if (sortMode === 'topLevelResource') {
                let cur = rnode.uid;
                let parents = parentsFor[rnode.uid];
                while ((parents || []).length > 0) {
                    cur = parents[0].uid;
                    parents = parentsFor[cur];
                }
                if (groupRefs[cur]) {
                    groupRefs[cur].pods.push(p);
                }
            }
        });

        Object.values(groupRefs).forEach(group => group.pods.sort((first, second) => nodeKey(first).localeCompare(nodeKey(second), undefined, {numeric: true})));

        return Object.values(groupRefs)
            .sort((a, b) => (a.name > b.name ? 1 : a.name === b.name ? 0 : -1)) // sort by name
            .filter(i => (i.pods || []).length > 0); // filter out groups with no pods
    }
}

const labelForSortMode = {
    node: 'Node',
    parentResource: 'Parent Resource',
    topLevelResource: 'Top Level Resource'
};

const sizes = ['Bytes', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei', 'Zi', 'Yi'];
function formatSize(bytes: number) {
    if (!bytes) {
        return '0 Bytes';
    }
    const k = 1024;
    const dm = 2;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatMetric(name: ResourceName, val: number) {
    if (name === ResourceName.ResourceStorage || name === ResourceName.ResourceMemory) {
        // divide by 1000 to convert "milli bytes" to bytes
        return formatSize(val / 1000);
    }
    // cpu millicores
    return (val || '0') + 'm';
}

function renderStats(info: HostResourceInfo) {
    const neighborsHeight = 100 * (info.requestedByNeighbors / info.capacity);
    const appHeight = 100 * (info.requestedByApp / info.capacity);
    return (
        <div className='pod-view__node__pod__stat' key={info.resourceName}>
            <Tooltip
                key={info.resourceName}
                content={
                    <React.Fragment>
                        <div>{info.resourceName.toUpperCase()}:</div>
                        <div className='pod-view__node__pod__stat-tooltip'>
                            <div>Requests:</div>
                            <div>
                                {' '}
                                <i className='pod-view__node__pod__stat-icon-app' /> {formatMetric(info.resourceName, info.requestedByApp)} (App)
                            </div>
                            <div>
                                {' '}
                                <i className='pod-view__node__pod__stat-icon-neighbors' /> {formatMetric(info.resourceName, info.requestedByNeighbors)} (Neighbors)
                            </div>
                            <div>Capacity: {formatMetric(info.resourceName, info.capacity)}</div>
                        </div>
                    </React.Fragment>
                }>
                <div className='pod-view__node__pod__stat__bar'>
                    <div className='pod-view__node__pod__stat__bar--fill pod-view__node__pod__stat__bar--neighbors' style={{height: `${neighborsHeight}%`}} />
                    <div className='pod-view__node__pod__stat__bar--fill' style={{bottom: `${neighborsHeight}%`, height: `${appHeight}%`}} />
                </div>
            </Tooltip>
            <div className='pod-view__node__label'>{info.resourceName.slice(0, 3).toUpperCase()}</div>
        </div>
    );
}
