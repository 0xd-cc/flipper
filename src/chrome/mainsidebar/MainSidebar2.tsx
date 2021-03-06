/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import BaseDevice from '../../devices/BaseDevice';
import Client from '../../Client';
import {UninitializedClient} from '../../UninitializedClient';
import {sortPluginsByName} from '../../plugin';
import {PluginNotification} from '../../reducers/notifications';
import {ActiveSheet} from '../../reducers/application';
import {State as Store} from '../../reducers';
import {
  Sidebar,
  colors,
  Glyph,
  styled,
  GK,
  FlipperPlugin,
  FlipperDevicePlugin,
  ArchivedDevice,
  SmallText,
  Info,
  HBox,
  LoadingIndicator,
} from 'flipper';
import React, {
  PureComponent,
  Fragment,
  memo,
  useCallback,
  useState,
} from 'react';
import NotificationScreen from '../NotificationScreen';
import {
  selectPlugin,
  starPlugin as starPluginAction,
  StaticView,
  setStaticView,
  getAvailableClients,
  canBeDefaultDevice,
} from '../../reducers/connections';
import {setActiveSheet} from '../../reducers/application';
import {connect} from 'react-redux';
import SupportRequestFormManager from '../../fb-stubs/SupportRequestFormManager';
import SupportRequestDetails from '../../fb-stubs/SupportRequestDetails';
import MainSidebarUtilsSection from './MainSidebarUtilsSection';
import {
  ListItem,
  PluginName,
  Plugins,
  CategoryName,
  PluginIcon,
  PluginSidebarListItem,
  NoClients,
  NoDevices,
  getColorByApp,
} from './sidebarUtils';

type FlipperPlugins = typeof FlipperPlugin[];
type PluginsByCategory = [string, FlipperPlugins][];

type SectionLevel = 1 | 2 | 3;

const SidebarSectionButton = styled('button')<{
  level: SectionLevel;
  color: string;
}>(({level, color}) => ({
  fontWeight: level === 3 ? 'normal' : 'bold',
  borderRadius: 0,
  border: 'none',
  background: level === 1 ? colors.sectionHeaderBorder : 'transparent',
  textAlign: level === 3 ? 'center' : 'left',
  width: '100%',
  fontSize: level === 3 ? 11 : 14,
  color,
  padding: `${level === 3 ? 0 : 8}px 10px 8px 9px`,
  textTransform: 'capitalize',
  fontVariantCaps: level === 2 ? 'all-small-caps' : 'normal',
}));

const SidebarSectionBody = styled('div')<{
  level: SectionLevel;
  collapsed: boolean;
}>(({collapsed}) => ({
  flexShrink: 0,
  overflow: 'hidden',
  maxHeight: collapsed ? 0 : 2000, // might need increase if too many plugins...
  transition: collapsed
    ? 'max-height 0.3s ease-out'
    : 'max-height 0.5s ease-in',
}));

const SidebarSection: React.FC<{
  defaultCollapsed?: boolean;
  title: string | React.ReactNode | ((collapsed: boolean) => React.ReactNode);
  level: SectionLevel;
  color?: string;
}> = ({children, title, level, color, defaultCollapsed}) => {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);
  color = color || colors.macOSTitleBarIconActive;

  return (
    <>
      <SidebarSectionButton
        onClick={() => setCollapsed(s => !s)}
        level={level}
        color={color}>
        <HBox grow="left">
          {typeof title === 'function' ? title(collapsed) : title}
          {level < 3 && children && (
            <Glyph
              name={collapsed ? 'chevron-down' : 'chevron-up'}
              size={12}
              color={color}
            />
          )}
        </HBox>
      </SidebarSectionButton>
      <SidebarSectionBody level={level} collapsed={collapsed}>
        {level === 1 && <div style={{height: 8}} />}
        {children}
      </SidebarSectionBody>
    </>
  );
};

type OwnProps = {};

type StateFromProps = {
  numNotifications: number;
  windowIsFocused: boolean;
  devices: BaseDevice[];
  selectedDevice: BaseDevice | null | undefined;
  staticView: StaticView;
  selectedPlugin: string | null | undefined;
  selectedApp: string | null | undefined;
  userStarredPlugins: Store['connections']['userStarredPlugins'];
  clients: Array<Client>;
  uninitializedClients: Array<{
    client: UninitializedClient;
    deviceId?: string;
    errorMessage?: string;
  }>;
  devicePlugins: Map<string, typeof FlipperDevicePlugin>;
  clientPlugins: Map<string, typeof FlipperPlugin>;
};

type SelectPlugin = (payload: {
  selectedPlugin: string | null;
  selectedApp?: string | null;
  deepLinkPayload: string | null;
  selectedDevice: BaseDevice;
}) => void;

type DispatchFromProps = {
  selectPlugin: SelectPlugin;
  setActiveSheet: (activeSheet: ActiveSheet) => void;
  setStaticView: (payload: StaticView) => void;
  starPlugin: typeof starPluginAction;
};

type Props = OwnProps & StateFromProps & DispatchFromProps;
type State = {
  showSupportForm: boolean;
  showWatchDebugRoot: boolean;
  showAllPlugins: boolean;
};

class MainSidebar2 extends PureComponent<Props, State> {
  state: State = {
    showSupportForm: GK.get('support_requests_v2'),
    showWatchDebugRoot: GK.get('watch_team_flipper_clientless_access'),
    showAllPlugins: false,
  };
  static getDerivedStateFromProps(props: Props, state: State) {
    if (
      !state.showSupportForm &&
      props.staticView === SupportRequestFormManager
    ) {
      // Show SupportForm option even when GK is false and support form is shown.
      // That means the user has used deeplink to open support form.
      // Once the variable is true, it will be true for the whole session.
      return {showSupportForm: true};
    }
    return state;
  }

  render() {
    const devices = this.props.devices
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title));
    const renderableDevices = devices.filter(canBeDefaultDevice);

    return (
      <Sidebar position="left" width={200} backgroundColor={colors.light02}>
        <Plugins>
          {renderableDevices.length ? (
            renderableDevices.map(device => this.renderDevice(device))
          ) : (
            <NoDevices />
          )}
        </Plugins>
        <MainSidebarUtilsSection />
      </Sidebar>
    );
  }

  renderDevice(device: BaseDevice) {
    const {
      selectedPlugin,
      selectPlugin,
      uninitializedClients,
      clientPlugins,
      starPlugin,
      userStarredPlugins,
      selectedApp,
      selectedDevice,
    } = this.props;
    const clients = getAvailableClients(device, this.props.clients);

    return (
      <SidebarSection title={device.title} key={device.serial} level={1}>
        {this.showArchivedDeviceDetails(device)}
        <SidebarSection level={2} title="Device" defaultCollapsed={true}>
          {device.devicePlugins.map(pluginName => {
            const plugin = this.props.devicePlugins.get(pluginName)!;
            return (
              <PluginSidebarListItem
                key={plugin.id}
                isActive={
                  plugin.id === selectedPlugin && selectedDevice === device
                }
                onClick={() =>
                  selectPlugin({
                    selectedPlugin: plugin.id,
                    selectedApp: null,
                    deepLinkPayload: null,
                    selectedDevice: device,
                  })
                }
                plugin={plugin}
              />
            );
          })}
        </SidebarSection>
        {clients.length === 0 ? (
          <NoClients />
        ) : (
          clients.map(client => (
            <PluginList
              device={device}
              key={client.id}
              client={client}
              clientPlugins={clientPlugins}
              starPlugin={starPlugin}
              userStarredPlugins={userStarredPlugins}
              selectedPlugin={selectedPlugin}
              selectedApp={selectedApp}
              selectPlugin={selectPlugin}
            />
          ))
        )}
        {uninitializedClients.map(entry => (
          <SidebarSection
            color={getColorByApp(entry.client.appName)}
            key={JSON.stringify(entry.client)}
            title={
              <HBox grow="left">
                {entry.client.appName}
                {entry.errorMessage ? (
                  <Glyph name={'mobile-cross'} size={16} />
                ) : (
                  <LoadingIndicator size={16} />
                )}
              </HBox>
            }
            level={2}></SidebarSection>
        ))}
      </SidebarSection>
    );
  }

  showArchivedDeviceDetails(device: BaseDevice) {
    if (!device.isArchived || !device.source) {
      return null;
    }
    const {staticView, setStaticView} = this.props;
    const supportRequestDetailsactive = isStaticViewActive(
      staticView,
      SupportRequestDetails,
    );
    return (
      <>
        <ListItem>
          <Info type="warning" small>
            {device.source ? 'Imported device' : 'Archived device'}
          </Info>
        </ListItem>
        {this.state.showSupportForm &&
          (device as ArchivedDevice).supportRequestDetails && (
            <ListItem
              active={supportRequestDetailsactive}
              onClick={() => setStaticView(SupportRequestDetails)}>
              <PluginIcon
                color={colors.light50}
                name={'app-dailies'}
                isActive={supportRequestDetailsactive}
              />
              <PluginName isActive={supportRequestDetailsactive}>
                Support Request Details
              </PluginName>
            </ListItem>
          )}
      </>
    );
  }

  renderNotificationsEntry() {
    if (GK.get('flipper_disable_notifications')) {
      return null;
    }

    const active = isStaticViewActive(
      this.props.staticView,
      NotificationScreen,
    );
    return (
      <ListItem
        active={active}
        onClick={() => this.props.setStaticView(NotificationScreen)}
        style={{
          borderTop: `1px solid ${colors.blackAlpha10}`,
        }}>
        <PluginIcon
          color={colors.light50}
          name={this.props.numNotifications > 0 ? 'bell' : 'bell-null'}
          isActive={active}
        />
        <PluginName count={this.props.numNotifications} isActive={active}>
          Notifications
        </PluginName>
      </ListItem>
    );
  }
}

function isStaticViewActive(
  current: StaticView,
  selected: StaticView,
): boolean {
  return current && selected && current === selected;
}

function getFavoritePlugins(
  allPlugins: FlipperPlugins,
  starredPlugins: undefined | string[],
  favorite: boolean,
): FlipperPlugins {
  if (!starredPlugins || !starredPlugins.length) {
    return favorite ? [] : allPlugins;
  }
  return allPlugins.filter(plugin => {
    const idx = starredPlugins.indexOf(plugin.id);
    return idx === -1 ? !favorite : favorite;
  });
}

function groupPluginsByCategory(plugins: FlipperPlugins): PluginsByCategory {
  const sortedPlugins = plugins.slice().sort(sortPluginsByName);
  const byCategory: {[cat: string]: FlipperPlugins} = {};
  const res: PluginsByCategory = [];
  sortedPlugins.forEach(plugin => {
    const category = plugin.category || '';
    (byCategory[category] || (byCategory[category] = [])).push(plugin);
  });
  // Sort categories
  Object.keys(byCategory)
    .sort()
    .forEach(category => {
      res.push([category, byCategory[category]]);
    });
  return res;
}

export default connect<StateFromProps, DispatchFromProps, OwnProps, Store>(
  ({
    application: {windowIsFocused},
    connections: {
      devices,
      selectedDevice,
      selectedPlugin,
      selectedApp,
      userStarredPlugins,
      clients,
      uninitializedClients,
      staticView,
    },
    notifications: {activeNotifications, blacklistedPlugins},
    plugins: {devicePlugins, clientPlugins},
  }) => ({
    numNotifications: (() => {
      const blacklist = new Set(blacklistedPlugins);
      return activeNotifications.filter(
        (n: PluginNotification) => !blacklist.has(n.pluginId),
      ).length;
    })(),
    windowIsFocused,
    devices,
    selectedDevice,
    staticView,
    selectedPlugin,
    selectedApp,
    userStarredPlugins,
    clients,
    uninitializedClients,
    devicePlugins,
    clientPlugins,
  }),
  {
    selectPlugin,
    setStaticView,
    setActiveSheet,
    starPlugin: starPluginAction,
  },
)(MainSidebar2);

const PluginList = memo(function PluginList({
  client,
  device,
  clientPlugins,
  starPlugin,
  userStarredPlugins,
  selectedPlugin,
  selectedApp,
  selectPlugin,
}: {
  client: Client;
  device: BaseDevice;
  clientPlugins: Map<string, typeof FlipperPlugin>;
  starPlugin: typeof starPluginAction;
  userStarredPlugins: Store['connections']['userStarredPlugins'];
  selectedPlugin?: null | string;
  selectPlugin: SelectPlugin;
  selectedApp?: null | string;
}) {
  const onFavorite = useCallback(
    (plugin: string) => {
      starPlugin({
        selectedApp: client.query.app,
        selectedPlugin: plugin,
      });
    },
    [client],
  );

  const allPlugins = Array.from(clientPlugins.values()).filter(
    (p: typeof FlipperPlugin) => client.plugins.indexOf(p.id) > -1,
  );
  const favoritePlugins: FlipperPlugins = getFavoritePlugins(
    allPlugins,
    userStarredPlugins[client.query.app],
    true,
  );
  const selectedNonFavoritePlugin =
    selectedApp === client.id &&
    client.plugins.includes(selectedPlugin!) &&
    !favoritePlugins.find(plugin => plugin.id === selectedPlugin);
  const allPluginsStarred = favoritePlugins.length === allPlugins.length;

  return (
    <SidebarSection
      level={2}
      key={client.id}
      title={client.query.app}
      color={getColorByApp(client.query.app)}>
      {favoritePlugins.length === 0 ? (
        <ListItem>
          <SmallText center>Star your favorite plugins!</SmallText>
        </ListItem>
      ) : (
        <PluginsByCategory
          client={client}
          device={device}
          plugins={favoritePlugins}
          starred={true}
          onFavorite={onFavorite}
          selectedPlugin={selectedPlugin}
          selectedApp={selectedApp}
          selectPlugin={selectPlugin}
        />
      )}
      {!allPluginsStarred && (
        <SidebarSection
          level={3}
          color={colors.macOSTitleBarIconBlur}
          defaultCollapsed={
            favoritePlugins.length > 0 && !selectedNonFavoritePlugin
          }
          title={collapsed => (
            <ShowMoreButton>
              <Glyph
                color={colors.macOSTitleBarIconBlur}
                size={8}
                name={collapsed ? 'chevron-down' : 'chevron-up'}
              />
            </ShowMoreButton>
          )}>
          <PluginsByCategory
            client={client}
            device={device}
            plugins={getFavoritePlugins(
              allPlugins,
              userStarredPlugins[client.query.app],
              false,
            )}
            starred={false}
            onFavorite={onFavorite}
            selectedPlugin={selectedPlugin}
            selectedApp={selectedApp}
            selectPlugin={selectPlugin}
          />
        </SidebarSection>
      )}
    </SidebarSection>
  );
});

const PluginsByCategory = memo(function PluginsByCategory({
  client,
  plugins,
  starred,
  onFavorite,
  selectedPlugin,
  selectedApp,
  selectPlugin,
  device,
}: {
  client: Client;
  device: BaseDevice;
  plugins: FlipperPlugins;
  starred: boolean;
  selectedPlugin?: null | string;
  selectedApp?: null | string;
  onFavorite: (pluginId: string) => void;
  selectPlugin: SelectPlugin;
}) {
  return (
    <>
      {groupPluginsByCategory(plugins).map(([category, plugins]) => (
        <Fragment key={category}>
          {category && (
            <ListItem>
              <CategoryName>{category}</CategoryName>
            </ListItem>
          )}
          {plugins.map(plugin => (
            <PluginSidebarListItem
              key={plugin.id}
              isActive={
                plugin.id === selectedPlugin && selectedApp === client.id
              }
              onClick={() =>
                selectPlugin({
                  selectedPlugin: plugin.id,
                  selectedApp: client.id,
                  deepLinkPayload: null,
                  selectedDevice: device,
                })
              }
              plugin={plugin}
              app={client.query.app}
              onFavorite={() => onFavorite(plugin.id)}
              starred={starred}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
});

const ShowMoreButton = styled('div')({
  border: `1px solid ${colors.macOSTitleBarIconBlur}`,
  width: 16,
  height: 16,
  borderRadius: 16,
  marginLeft: 'auto',
  marginRight: 'auto',
  lineHeight: '12px',
});
